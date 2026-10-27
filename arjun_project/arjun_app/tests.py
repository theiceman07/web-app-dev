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
