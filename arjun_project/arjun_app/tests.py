import json
import re
import urllib.error
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.core.cache import cache
from django.test import Client, TestCase, override_settings

from . import mongo, services, views
from .errors import ERROR_CODES, REQUIRED_CODES
from .models import FAQ, Ticket

GEMINI_OK = {'candidates': [{'content': {'parts': [{'text': 'Press Play first, then check the volume.'}]}}]}


def gemini(text):
    return {'candidates': [{'content': {'parts': [{'text': text}]}}]}


class PageTests(TestCase):
    def test_index_serves_app_and_sets_csrf_cookie(self):
        r = self.client.get('/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('csrftoken', r.cookies)

    def test_at_least_three_pages_open(self):
        for path in ['/', '/faq/', '/support/', '/status/', '/health/']:
            self.assertEqual(self.client.get(path).status_code, 200, path)

    def test_chat_widget_is_on_every_server_rendered_page(self):
        for path in ['/faq/', '/support/', '/status/', '/status/404/', '/status/500/', '/health/', '/nope']:
            r = self.client.get(path)
            self.assertContains(r, '/static/assets/widget.js', status_code=r.status_code, msg_prefix=path)
            self.assertContains(r, 'id="fc-widget"', status_code=r.status_code, msg_prefix=path)

    def test_pages_are_responsive(self):
        for path in ['/faq/', '/support/', '/health/', '/status/']:
            self.assertContains(self.client.get(path), 'name="viewport" content="width=device-width, initial-scale=1.0"')


class FaqTests(TestCase):
    def test_at_least_ten_faqs_are_stored_in_sql_and_shown(self):
        self.assertGreaterEqual(FAQ.objects.count(), 10)
        r = self.client.get('/faq/')
        for faq in FAQ.objects.all():
            self.assertContains(r, faq.question)

    def test_unpublished_faq_is_hidden(self):
        FAQ.objects.create(question='Secret draft question?', answer='x', is_published=False)
        self.assertNotContains(self.client.get('/faq/'), 'Secret draft question?')


class ErrorPageTests(TestCase):
    def test_required_codes_all_exist_with_real_http_status(self):
        self.assertGreaterEqual(len(REQUIRED_CODES), 8)
        for code in REQUIRED_CODES:
            self.assertIn(code, ERROR_CODES)
            r = self.client.get(f'/status/{code}/')
            self.assertEqual(r.status_code, ERROR_CODES[code]['http'], code)
            self.assertContains(r, code, status_code=r.status_code)

    def test_site_specific_code_exists(self):
        self.assertTrue(any(c.startswith('FC-') for c in ERROR_CODES))

    def test_custom_404_has_ask_the_assistant(self):
        r = self.client.get('/this-address-is-wrong')
        self.assertEqual(r.status_code, 404)
        self.assertContains(r, 'No sound here', status_code=404)
        self.assertContains(r, 'Ask the assistant', status_code=404)

    def test_custom_500_has_ask_the_assistant(self):
        r = self.client.get('/status/500/')
        self.assertEqual(r.status_code, 500)
        self.assertContains(r, 'Ask the assistant', status_code=500)

    def test_error_handlers_render_custom_pages(self):
        for handler, status in [(views.handler400, 400), (views.handler403, 403), (views.handler404, 404)]:
            r = handler(mock.Mock())
            self.assertEqual(r.status_code, status)

    def test_202_is_not_styled_as_an_error(self):
        self.assertContains(self.client.get('/status/202/'), 'tone-info', status_code=202)

    def test_unknown_status_code_is_404(self):
        self.assertEqual(self.client.get('/status/418/').status_code, 404)

    def test_csrf_failure_shows_403_page(self):
        c = Client(enforce_csrf_checks=True)
        r = c.post('/support/', {'name': 'a'})
        self.assertEqual(r.status_code, 403)
        self.assertContains(r, 'This room is closed', status_code=403)


class SupportTicketTests(TestCase):
    form = {'name': 'Ana', 'email': 'ana@example.com', 'subject': 'No sound', 'message': 'I cannot hear anything at all.'}

    def setUp(self):
        cache.clear()

    def test_submitting_the_form_stores_a_ticket_in_sql(self):
        r = self.client.post('/support/', self.form)
        self.assertEqual(r.status_code, 302)
        ticket = Ticket.objects.get()
        self.assertTrue(re.fullmatch(r'FC-[A-Z0-9]{6}', ticket.reference))
        self.assertEqual((ticket.source, ticket.status), ('web', 'open'))
        self.assertIn(ticket.reference, r['Location'])

    def test_invalid_form_returns_400_and_stores_nothing(self):
        r = self.client.post('/support/', {**self.form, 'email': 'nope', 'message': 'short'})
        self.assertEqual(r.status_code, 400)
        self.assertContains(r, 'Enter a valid email address.', status_code=400)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_honeypot_creates_no_ticket(self):
        self.client.post('/support/', {**self.form, 'website': 'http://spam'})
        self.assertEqual(Ticket.objects.count(), 0)

    def test_ticket_rate_limit_returns_429(self):
        codes = [self.client.post('/support/', self.form).status_code for _ in range(views.TICKET_RATE_LIMIT + 1)]
        self.assertEqual(codes[-1], 429)

    def test_lookup_returns_401_404_403_and_200(self):
        t = Ticket.objects.create(name='Ana', email='ana@example.com', subject='s', message='m' * 12)
        url = f'/api/tickets/{t.reference}/'
        self.assertEqual(self.client.get(url).status_code, 401)
        self.assertEqual(self.client.get('/api/tickets/FC-NOPE00/', HTTP_X_TICKET_EMAIL='a@b.co').status_code, 404)
        self.assertEqual(self.client.get(url, HTTP_X_TICKET_EMAIL='other@example.com').status_code, 403)
        r = self.client.get(url, HTTP_X_TICKET_EMAIL='ANA@example.com')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['status'], 'open')


class AssistantTests(TestCase):
    def setUp(self):
        cache.clear()
        patcher = mock.patch.object(mongo, 'insert', return_value=True)
        self.mongo_insert = patcher.start()
        self.addCleanup(patcher.stop)

    def ask(self, text, **extra):
        body = {'messages': [{'role': 'user', 'text': text}], 'session_id': 'sess1', **extra}
        return self.client.post('/api/assistant/', data=json.dumps(body), content_type='application/json')

    def test_get_is_not_allowed(self):
        self.assertEqual(self.client.get('/api/assistant/').status_code, 405)

    def test_csrf_is_enforced(self):
        r = Client(enforce_csrf_checks=True).post('/api/assistant/', data='{}', content_type='application/json')
        self.assertEqual(r.status_code, 403)

    @override_settings(GOOGLE_API_KEY='k')
    def test_bad_requests_return_400(self):
        for payload in ['not json', '{}', '{"messages":[]}', '{"messages":[{"role":"user","text":"  "}]}',
                        '{"messages":[{"role":"model","text":"x"}]}']:
            r = self.client.post('/api/assistant/', data=payload, content_type='application/json')
            self.assertEqual(r.status_code, 400, payload)

    @override_settings(GOOGLE_API_KEY='k')
    def test_error_code_questions_are_explained_from_the_table_without_the_ai(self):
        with mock.patch.object(views, '_call_gemini') as ai:
            for code in ['404', '503', 'FC-100', '429']:
                r = self.ask(f'what does error {code} mean?')
                self.assertEqual(r.status_code, 200)
                self.assertEqual(r.json()['source'], 'error_table')
                self.assertIn(ERROR_CODES[code]['title'], r.json()['reply'])
            ai.assert_not_called()

    @override_settings(GOOGLE_API_KEY='k')
    def test_ai_answer_is_used_when_available(self):
        with mock.patch.object(views, '_call_gemini', return_value=GEMINI_OK) as ai:
            r = self.ask('Why is it silent?')
        self.assertEqual(r.json()['source'], 'gemini')
        self.assertIsNone(r.json()['ticket'])
        system = ai.call_args[0][1]['systemInstruction']['parts'][0]['text']
        self.assertIn(FAQ.objects.first().question, system)  # the prompt carries the FAQ data
        self.assertIn('FC-100', system)  # and the error table

    @override_settings(GOOGLE_API_KEY='k')
    def test_no_answer_from_ai_creates_a_ticket(self):
        with mock.patch.object(views, '_call_gemini', return_value=gemini('NO_ANSWER')):
            r = self.ask('Do you sell guitars?')
        data = r.json()
        self.assertEqual(data['source'], 'ticket')
        ticket = Ticket.objects.get(reference=data['ticket']['reference'])
        self.assertEqual((ticket.source, ticket.chat_session_id), ('assistant', 'sess1'))
        self.assertIn('guitars', ticket.message)

    @override_settings(GOOGLE_API_KEY='k')
    def test_ai_timeout_falls_back_to_faq_with_fc100_notice(self):
        with mock.patch.object(views, '_call_gemini', side_effect=TimeoutError('slow')):
            r = self.ask('Why can I not hear anything?')
        data = r.json()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(data['source'], 'faq')
        self.assertEqual(data['notice']['code'], 'FC-100')
        self.assertIn('Play first', data['reply'])

    @override_settings(GOOGLE_API_KEY='k')
    def test_ai_http_error_with_no_faq_match_creates_a_ticket(self):
        err = urllib.error.HTTPError('u', 503, 'down', {}, None)
        with mock.patch.object(views, '_call_gemini', side_effect=err):
            r = self.ask('Do you sell guitars?')
        self.assertEqual(r.json()['source'], 'ticket')
        self.assertEqual(Ticket.objects.count(), 1)

    @override_settings(GOOGLE_API_KEY='')
    def test_without_a_key_the_faq_still_answers(self):
        r = self.ask('Can I export my scene to Unity?')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['source'], 'faq')
        self.assertIn('WAV', r.json()['reply'])

    @override_settings(GOOGLE_API_KEY='k')
    def test_chat_is_logged_to_mongodb_with_a_message_id(self):
        with mock.patch.object(views, '_call_gemini', return_value=GEMINI_OK):
            r = self.ask('Why is it silent?')
        collection, doc = self.mongo_insert.call_args[0]
        self.assertEqual(collection, mongo.CHAT_LOGS)
        self.assertEqual(doc['message_id'], r.json()['message_id'])
        self.assertEqual((doc['question'], doc['session_id'], doc['source']), ('Why is it silent?', 'sess1', 'gemini'))

    @override_settings(GOOGLE_API_KEY='k')
    def test_a_mongodb_outage_does_not_break_the_assistant(self):
        self.mongo_insert.return_value = False
        with mock.patch.object(views, '_call_gemini', return_value=GEMINI_OK):
            self.assertEqual(self.ask('Why is it silent?').status_code, 200)

    @override_settings(GOOGLE_API_KEY='k')
    def test_rate_limit_returns_429(self):
        with mock.patch.object(views, '_call_gemini', return_value=GEMINI_OK):
            codes = [self.ask('hi').status_code for _ in range(views.RATE_LIMIT + 1)]
        self.assertEqual(codes[:-1], [200] * views.RATE_LIMIT)
        self.assertEqual(codes[-1], 429)

    @override_settings(GOOGLE_API_KEY='secret-key-123')
    def test_key_is_never_in_a_response(self):
        with mock.patch.object(views, '_call_gemini', side_effect=OSError('boom')):
            r = self.ask('hello there')
        self.assertNotIn('secret-key-123', r.content.decode())

    def test_attach_email_to_an_assistant_ticket(self):
        t = Ticket.objects.create(source='assistant', subject='s', message='m', chat_session_id='sess1')
        post = lambda body: self.client.post('/api/tickets/email/', data=json.dumps(body), content_type='application/json')
        self.assertEqual(post({'reference': t.reference, 'session_id': 'other', 'email': 'a@b.co'}).status_code, 404)
        self.assertEqual(post({'reference': t.reference, 'session_id': 'sess1', 'email': 'bad'}).status_code, 400)
        self.assertEqual(post({'reference': t.reference, 'session_id': 'sess1', 'email': 'a@b.co'}).status_code, 200)
        self.assertEqual(post({'reference': t.reference, 'session_id': 'sess1', 'email': 'c@d.co'}).status_code, 403)


class FeedbackTests(TestCase):
    def setUp(self):
        cache.clear()

    def send(self, body):
        return self.client.post('/api/feedback/', data=json.dumps(body), content_type='application/json')

    def test_feedback_is_stored_in_mongodb_and_returns_202(self):
        with mock.patch.object(mongo, 'insert', return_value=True) as insert:
            r = self.send({'message_id': 'm1', 'session_id': 's1', 'rating': 'down', 'comment': 'wrong'})
        self.assertEqual(r.status_code, 202)
        collection, doc = insert.call_args[0]
        self.assertEqual(collection, mongo.FEEDBACK)
        self.assertEqual((doc['message_id'], doc['rating'], doc['comment']), ('m1', 'down', 'wrong'))

    def test_feedback_returns_503_when_mongodb_is_unavailable(self):
        with mock.patch.object(mongo, 'insert', return_value=False):
            self.assertEqual(self.send({'message_id': 'm1', 'rating': 'up'}).status_code, 503)

    def test_invalid_feedback_returns_400(self):
        for body in [{}, {'message_id': 'm1', 'rating': 'maybe'}, {'rating': 'up'}]:
            self.assertEqual(self.send(body).status_code, 400, body)


class MongoTests(TestCase):
    @override_settings(MONGODB_URI='')
    def test_insert_without_configuration_returns_false_and_never_raises(self):
        self.assertFalse(mongo.insert('chat_logs', {'a': 1}))
        self.assertEqual(mongo.ping()[0], 'not_configured')

    @override_settings(MONGODB_URI='mongodb://x', MONGODB_DB='d')
    def test_insert_adds_a_timestamp_and_swallows_errors(self):
        fake_collection = mock.Mock()
        fake_db = {'chat_logs': fake_collection}
        with mock.patch.object(mongo, '_db', return_value=fake_db):
            self.assertTrue(mongo.insert('chat_logs', {'a': 1}))
        self.assertIn('created_at', fake_collection.insert_one.call_args[0][0])
        fake_collection.insert_one.side_effect = RuntimeError('down')
        with mock.patch.object(mongo, '_db', return_value=fake_db):
            self.assertFalse(mongo.insert('chat_logs', {'a': 1}))


class HealthAndLoggingTests(TestCase):
    def test_health_json_reports_every_service(self):
        r = self.client.get('/api/health/')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn(data['status'], ('ok', 'degraded'))
        self.assertEqual(data['checks']['sql_database']['status'], 'ok')
        for key in ('mongodb', 'ai_service', 'weather_api'):
            self.assertIn(key, data['checks'])
        self.assertGreaterEqual(data['counts']['faqs'], 10)

    def test_health_page_renders(self):
        r = self.client.get('/health/')
        self.assertContains(r, 'SQL database')
        self.assertContains(r, 'Recent requests')

    def test_health_is_503_when_the_database_is_down(self):
        with mock.patch.object(views, '_check_database', return_value={'status': 'down', 'detail': 'OperationalError', 'ms': 1}):
            self.assertEqual(self.client.get('/api/health/').status_code, 503)

    def test_every_request_gets_an_id_and_is_logged(self):
        with self.assertLogs('foleycraft.requests', level='INFO') as logs:
            r = self.client.get('/faq/')
        self.assertTrue(r['X-Request-ID'])
        entry = json.loads(logs.records[0].getMessage())
        self.assertEqual((entry['method'], entry['path'], entry['status']), ('GET', '/faq/', 200))
        self.assertEqual(entry['id'], r['X-Request-ID'])
        self.assertNotIn('127.0.0.1', logs.records[0].getMessage())  # the client IP is hashed


class WeatherApiTests(TestCase):
    def setUp(self):
        cache.clear()

    def fake_response(self, code=63, day=1):
        body = json.dumps({'current': {'temperature_2m': 11.4, 'weather_code': code, 'is_day': day}}).encode()
        resp = mock.MagicMock()
        resp.read.return_value = body
        resp.__enter__.return_value = resp
        return resp

    def test_rain_maps_to_a_scene(self):
        with mock.patch.object(services.urllib.request, 'urlopen', return_value=self.fake_response(63)):
            data = self.client.get('/api/weather-scene/?lat=48.8&lon=2.3').json()
        self.assertEqual((data['scene'], data['source'], data['fallback']), ('cyberpunk_alley', 'open-meteo', False))

    def test_the_call_has_a_time_limit(self):
        with mock.patch.object(services.urllib.request, 'urlopen', return_value=self.fake_response()) as op:
            self.client.get('/api/weather-scene/')
        self.assertEqual(op.call_args.kwargs['timeout'], services.WEATHER_TIMEOUT_S)

    def test_timeout_returns_the_fallback_scene(self):
        with mock.patch.object(services.urllib.request, 'urlopen', side_effect=TimeoutError('slow')):
            r = self.client.get('/api/weather-scene/')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual((data['source'], data['fallback'], data['scene']), ('fallback', True, 'cozy_tavern'))

    def test_bad_response_returns_the_fallback_scene(self):
        resp = mock.MagicMock()
        resp.read.return_value = b'not json'
        resp.__enter__.return_value = resp
        with mock.patch.object(services.urllib.request, 'urlopen', return_value=resp):
            self.assertTrue(self.client.get('/api/weather-scene/').json()['fallback'])

    def test_invalid_coordinates_fall_back_to_the_default_location(self):
        with mock.patch.object(services.urllib.request, 'urlopen', return_value=self.fake_response()) as op:
            self.client.get('/api/weather-scene/?lat=999&lon=abc')
        self.assertIn(f'latitude={settings.WEATHER_DEFAULT_LAT}', op.call_args[0][0])


class ErrorCodesInSqlTests(TestCase):
    def test_at_least_eight_error_codes_are_stored_in_sql(self):
        from .models import ErrorCode

        stored = set(ErrorCode.objects.values_list('code', flat=True))
        self.assertGreaterEqual(len(stored), 8)
        self.assertTrue(set(REQUIRED_CODES) <= stored)
        self.assertTrue(ErrorCode.objects.filter(is_site_specific=True, code__startswith='FC-').exists())

    def test_the_status_page_shows_what_is_in_the_database(self):
        from .models import ErrorCode

        ErrorCode.objects.filter(code='404').update(headline='Edited in SQL headline', cause='Edited cause from SQL')
        self.assertContains(self.client.get('/status/404/'), 'Edited in SQL headline', status_code=404)
        self.assertContains(self.client.get('/status/'), 'Edited cause from SQL')

    def test_the_assistant_explains_a_code_from_the_database_row(self):
        from .models import ErrorCode

        ErrorCode.objects.filter(code='429').update(fix='Custom fix text from the database.')
        with mock.patch.object(mongo, 'insert', return_value=True):
            r = self.client.post('/api/assistant/', data=json.dumps({'messages': [{'role': 'user', 'text': 'error 429?'}]}), content_type='application/json')
        self.assertIn('Custom fix text from the database.', r.json()['reply'])

    def test_error_pages_still_render_when_the_database_fails(self):
        from django.db import OperationalError

        with mock.patch('arjun_app.models.ErrorCode.objects') as objects:
            objects.filter.side_effect = OperationalError('db down')
            objects.all.side_effect = OperationalError('db down')
            r = self.client.get('/status/503/')
        self.assertEqual(r.status_code, 503)
        self.assertContains(r, 'Service unavailable', status_code=503)  # from the built-in fallback table


class FaqApiTests(TestCase):
    def test_api_returns_the_faqs_from_sql(self):
        r = self.client.get('/api/faqs/')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertGreaterEqual(data['count'], 10)
        self.assertEqual(data['count'], len(data['faqs']))
        self.assertEqual(set(data['faqs'][0]), {'id', 'question', 'answer', 'category', 'keywords'})

    def test_api_filters_by_category_and_hides_unpublished(self):
        FAQ.objects.create(question='Hidden?', answer='x', category='Support', is_published=False)
        data = self.client.get('/api/faqs/?category=support').json()
        self.assertTrue(data['faqs'] and all(f['category'] == 'Support' for f in data['faqs']))
        self.assertNotIn('Hidden?', [f['question'] for f in data['faqs']])

    def test_the_faq_page_loads_its_questions_from_the_api(self):
        self.assertContains(self.client.get('/faq/'), "fetch('/api/faqs/')")


class TicketCrudTests(TestCase):
    def setUp(self):
        cache.clear()
        self.t = Ticket.objects.create(name='Ana', email='ana@example.com', subject='Old subject', message='An original message here.')
        self.url = f'/api/tickets/{self.t.reference}/'
        self.auth = {'HTTP_X_TICKET_EMAIL': 'ana@example.com'}

    def patch(self, body, **extra):
        return self.client.patch(self.url, data=json.dumps(body), content_type='application/json', **(extra or self.auth))

    def test_read_returns_the_message(self):
        r = self.client.get(self.url, **self.auth)
        self.assertEqual((r.status_code, r.json()['message']), (200, 'An original message here.'))

    def test_update_changes_subject_message_and_status(self):
        r = self.patch({'subject': 'New subject', 'message': 'A brand new message text.', 'status': 'resolved'})
        self.assertEqual(r.status_code, 200)
        self.t.refresh_from_db()
        self.assertEqual((self.t.subject, self.t.message, self.t.status), ('New subject', 'A brand new message text.', 'resolved'))

    def test_update_validates_input(self):
        for body in [{}, {'subject': ''}, {'message': 'short'}, {'status': 'pending'}, {'unknown': 1}]:
            self.assertEqual(self.patch(body).status_code, 400, body)
        self.t.refresh_from_db()
        self.assertEqual(self.t.subject, 'Old subject')

    def test_update_and_delete_need_the_right_email(self):
        self.assertEqual(self.client.patch(self.url, data='{"subject":"x"}', content_type='application/json').status_code, 401)
        self.assertEqual(self.patch({'subject': 'x'}, HTTP_X_TICKET_EMAIL='other@example.com').status_code, 403)
        self.assertEqual(self.client.delete(self.url).status_code, 401)
        self.assertEqual(self.client.delete(self.url, HTTP_X_TICKET_EMAIL='other@example.com').status_code, 403)
        self.assertTrue(Ticket.objects.filter(pk=self.t.pk).exists())

    def test_delete_removes_the_ticket(self):
        r = self.client.delete(self.url, **self.auth)
        self.assertEqual((r.status_code, r.json()['status']), (200, 'deleted'))
        self.assertFalse(Ticket.objects.filter(pk=self.t.pk).exists())
        self.assertEqual(self.client.get(self.url, **self.auth).status_code, 404)

    def test_create_read_update_delete_through_the_support_flow(self):
        self.client.post('/support/', {'name': 'Bo', 'email': 'bo@example.com', 'subject': 'Flow', 'message': 'Testing the whole flow now.'})
        ref = Ticket.objects.get(email='bo@example.com').reference
        hdr = {'HTTP_X_TICKET_EMAIL': 'bo@example.com'}
        self.assertEqual(self.client.get(f'/api/tickets/{ref}/', **hdr).status_code, 200)
        self.assertEqual(self.client.patch(f'/api/tickets/{ref}/', data='{"subject":"Flow 2"}', content_type='application/json', **hdr).status_code, 200)
        self.assertEqual(self.client.delete(f'/api/tickets/{ref}/', **hdr).status_code, 200)
        self.assertEqual(self.client.get(f'/api/tickets/{ref}/', **hdr).status_code, 404)

    def test_csrf_is_enforced_for_update_and_delete(self):
        c = Client(enforce_csrf_checks=True)
        self.assertEqual(c.delete(self.url, **self.auth).status_code, 403)
        self.assertEqual(c.patch(self.url, data='{"subject":"x"}', content_type='application/json', **self.auth).status_code, 403)


class ConfigurationTests(TestCase):
    def test_no_secret_or_key_is_hard_coded_in_the_repository(self):
        root = Path(settings.BASE_DIR).parent
        patterns = [re.compile(p) for p in (r'AIza[0-9A-Za-z_\-]{20,}', r'django-insecure-', r'mongodb(\+srv)?://[^\s\'"<]+:[^\s\'"<@]+@')]
        offenders = []
        for path in list(root.glob('arjun_project/arjun_project/*.py')) + list(root.glob('arjun_project/arjun_app/*.py')) \
                + list(root.glob('arjun_project/arjun_app/template/*.html')) + [root / 'vercel.json', root / 'README.md', root / 'arjun_project/.env.example']:
            text = path.read_text()
            if path.name == 'tests.py':
                continue
            offenders += [f'{path.name}: {p.pattern}' for p in patterns if p.search(text)]
        self.assertEqual(offenders, [])

    def test_env_file_is_git_ignored(self):
        self.assertIn('.env', (Path(settings.BASE_DIR).parent / '.gitignore').read_text().splitlines())

    def test_database_url_is_parsed_into_postgres_settings(self):
        from arjun_project import settings as s

        with mock.patch.dict('os.environ', {'DATABASE_URL': 'postgres://u%40x:p%3Aw@db.example.com:6543/app?sslmode=require'}):
            cfg = s._database()
        self.assertEqual((cfg['ENGINE'], cfg['NAME'], cfg['USER'], cfg['PASSWORD'], cfg['HOST'], cfg['PORT']),
                         ('django.db.backends.postgresql', 'app', 'u@x', 'p:w', 'db.example.com', 6543))


class ErrorSimulationTests(TestCase):
    def test_every_code_can_be_simulated_on_a_page_with_its_real_status(self):
        for code, e in ERROR_CODES.items():
            r = self.client.get(f'/?simulate={code}')
            self.assertEqual(r.status_code, e['http'], code)
            self.assertEqual(r['X-Simulated-Error'], code)
            self.assertContains(r, code, status_code=e['http'])

    def test_simulating_on_an_api_returns_json(self):
        r = self.client.get('/api/faqs/?simulate=502')
        self.assertEqual(r.status_code, 502)
        self.assertEqual(r.json()['error']['code'], 502)
        r = self.client.get('/api/faqs/?simulate=offline')
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()['error']['site_code'], 'FC-000')

    def test_simulate_offline_shows_the_offline_page(self):
        r = self.client.get('/faq/?simulate=offline')
        self.assertEqual(r.status_code, 503)
        self.assertContains(r, 'FC-000', status_code=503)
        self.assertContains(r, 'You are offline.', status_code=503)

    def test_unknown_simulated_code_is_404(self):
        self.assertEqual(self.client.get('/?simulate=999').status_code, 404)

    @override_settings(ERROR_SIMULATION=False)
    def test_simulation_can_be_turned_off(self):
        self.assertEqual(self.client.get('/faq/?simulate=502').status_code, 200)


class RealErrorTests(TestCase):
    def test_removed_page_is_410(self):
        r = self.client.get('/beta/')
        self.assertEqual(r.status_code, 410)
        self.assertContains(r, 'Gone', status_code=410)

    def test_wrong_method_gets_the_styled_405_with_allow_header(self):
        r = self.client.get('/api/assistant/')
        self.assertEqual(r.status_code, 405)
        self.assertEqual(r.json()['error']['code'], 405)
        self.assertEqual(r['Allow'], 'POST')
        r = self.client.post('/health/')
        self.assertEqual(r.status_code, 405)
        self.assertContains(r, 'Method not allowed', status_code=405)

    def test_oversized_body_is_413(self):
        body = 'x' * (settings.DATA_UPLOAD_MAX_MEMORY_SIZE + 1)
        r = self.client.post('/api/assistant/', data=body, content_type='application/json')
        self.assertEqual(r.status_code, 413)
        self.assertEqual(r.json()['error']['code'], 413)


class OfflineTests(TestCase):
    def test_offline_code_is_stored_in_sql(self):
        from .models import ErrorCode
        row = ErrorCode.objects.get(code='FC-000')
        self.assertTrue(row.is_site_specific)
        self.assertEqual(row.http_status, 503)

    def test_offline_page_is_self_contained(self):
        r = self.client.get('/offline/')
        self.assertEqual(r.status_code, 503)
        self.assertNotIn('https://', r.content.decode())

    def test_service_worker_is_served_from_the_root(self):
        r = self.client.get('/sw.js')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'application/javascript')
        self.assertEqual(r['Service-Worker-Allowed'], '/')
        self.assertContains(r, "'/offline/'")

    def test_every_page_registers_the_service_worker(self):
        for path in ['/', '/faq/', '/support/', '/status/', '/health/', '/status/404/']:
            self.assertIn("register('/sw.js')", self.client.get(path).content.decode(), path)
