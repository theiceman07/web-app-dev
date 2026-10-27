import json
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings

from . import views


class PageTests(TestCase):
    def test_index_serves_app_and_sets_csrf_cookie(self):
        r = self.client.get('/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('csrftoken', r.cookies)

    def test_unknown_path_returns_custom_404(self):
        r = self.client.get('/no-such-page')
        self.assertEqual(r.status_code, 404)
        self.assertContains(r, 'No sound here', status_code=404)

    def test_status_index_lists_all_codes(self):
        r = self.client.get('/status/')
        self.assertEqual(r.status_code, 200)
        for code in views.STATUS_PAGES:
            self.assertContains(r, f'/status/{code}/')

    def test_each_status_page_answers_with_its_real_code(self):
        for code in views.STATUS_PAGES:
            r = self.client.get(f'/status/{code}/')
            self.assertEqual(r.status_code, code)
            self.assertContains(r, str(code), status_code=code)

    def test_202_is_not_styled_as_an_error(self):
        r = self.client.get('/status/202/')
        self.assertContains(r, 'tone-info', status_code=202)

    def test_unlisted_status_code_is_404(self):
        self.assertEqual(self.client.get('/status/418/').status_code, 404)


class AssistantTests(TestCase):
    def setUp(self):
        cache.clear()

    def post(self, payload):
        body = payload if isinstance(payload, str) else json.dumps(payload)
        return self.client.post('/api/assistant/', data=body, content_type='application/json')

    def test_get_is_not_allowed(self):
        self.assertEqual(self.client.get('/api/assistant/').status_code, 405)

    def test_csrf_is_enforced(self):
        from django.test import Client

        c = Client(enforce_csrf_checks=True)
        r = c.post('/api/assistant/', data='{}', content_type='application/json')
        self.assertEqual(r.status_code, 403)

    @override_settings(GOOGLE_API_KEY='')
    def test_without_key_returns_503_not_configured(self):
        r = self.post({'messages': [{'role': 'user', 'text': 'hi'}]})
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()['error']['type'], 'not_configured')

    @override_settings(GOOGLE_API_KEY='test-key')
    def test_bad_requests_return_400(self):
        for payload in [
            'not json',
            {},
            {'messages': []},
            {'messages': [{'role': 'user', 'text': '   '}]},
            {'messages': [{'role': 'model', 'text': 'x'}]},
            {'messages': [{'role': 'user', 'text': 'hi'}, {'role': 'model', 'text': 'yo'}]},
        ]:
            self.assertEqual(self.post(payload).status_code, 400, payload)

    @override_settings(GOOGLE_API_KEY='test-key')
    def test_successful_reply_and_prompt_shape(self):
        fake = {'candidates': [{'content': {'parts': [{'text': 'Try {{preset:dungeon_crypt}}.'}]}}]}
        with mock.patch.object(views, '_call_gemini', return_value=fake) as call:
            r = self.post({'messages': [{'role': 'user', 'text': 'hi'}], 'context': 'Presets: x'})
        self.assertEqual(r.status_code, 200)
        self.assertIn('dungeon_crypt', r.json()['reply'])
        body = call.call_args[0][1]
        self.assertIn('Presets: x', body['systemInstruction']['parts'][0]['text'])
        self.assertEqual(body['contents'][-1]['role'], 'user')

    @override_settings(GOOGLE_API_KEY='test-key')
    def test_empty_model_reply_is_502(self):
        with mock.patch.object(views, '_call_gemini', return_value={'candidates': []}):
            r = self.post({'messages': [{'role': 'user', 'text': 'hi'}]})
        self.assertEqual(r.status_code, 502)
        self.assertEqual(r.json()['error']['type'], 'empty_reply')

    @override_settings(GOOGLE_API_KEY='test-key')
    def test_rate_limit_returns_429(self):
        fake = {'candidates': [{'content': {'parts': [{'text': 'ok'}]}}]}
        with mock.patch.object(views, '_call_gemini', return_value=fake):
            codes = [self.post({'messages': [{'role': 'user', 'text': 'hi'}]}).status_code for _ in range(views.RATE_LIMIT + 1)]
        self.assertEqual(codes[:-1], [200] * views.RATE_LIMIT)
        self.assertEqual(codes[-1], 429)

    @override_settings(GOOGLE_API_KEY='test-key', UPSTASH_REDIS_REST_URL='https://r.example', UPSTASH_REDIS_REST_TOKEN='tok')
    def test_shared_store_is_used_when_configured(self):
        fake = {'candidates': [{'content': {'parts': [{'text': 'ok'}]}}]}
        with mock.patch.object(views, '_shared_count', return_value=views.RATE_LIMIT + 1) as shared, \
                mock.patch.object(views, '_call_gemini', return_value=fake) as gemini:
            r = self.post({'messages': [{'role': 'user', 'text': 'hi'}]})
        self.assertEqual(r.status_code, 429)
        shared.assert_called_once()
        gemini.assert_not_called()

    @override_settings(GOOGLE_API_KEY='test-key', UPSTASH_REDIS_REST_URL='https://r.example', UPSTASH_REDIS_REST_TOKEN='tok')
    def test_shared_store_outage_falls_back_to_local_counter(self):
        fake = {'candidates': [{'content': {'parts': [{'text': 'ok'}]}}]}
        with mock.patch.object(views, '_shared_count', side_effect=OSError('redis down')), \
                mock.patch.object(views, '_call_gemini', return_value=fake):
            r = self.post({'messages': [{'role': 'user', 'text': 'hi'}]})
        self.assertEqual(r.status_code, 200)

    def test_shared_count_sends_the_expected_redis_pipeline(self):
        class FakeResponse:
            def read(self):
                return b'[{"result":"OK"},{"result":7}]'

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        with override_settings(UPSTASH_REDIS_REST_URL='https://r.example/', UPSTASH_REDIS_REST_TOKEN='tok'):
            with mock.patch.object(views.urllib.request, 'urlopen', return_value=FakeResponse()) as op:
                self.assertEqual(views._shared_count('assistant:1.2.3.4'), 7)
        req = op.call_args[0][0]
        self.assertEqual(req.full_url, 'https://r.example/pipeline')
        self.assertEqual(req.get_header('Authorization'), 'Bearer tok')
        self.assertEqual(json.loads(req.data), [['SET', 'assistant:1.2.3.4', 0, 'EX', 60, 'NX'], ['INCR', 'assistant:1.2.3.4']])

    def test_client_ip_uses_forwarded_header_only_on_vercel(self):
        from django.test import RequestFactory

        req = RequestFactory().post('/api/assistant/', HTTP_X_FORWARDED_FOR='9.9.9.9, 10.0.0.1', REMOTE_ADDR='127.0.0.1')
        with override_settings(ON_VERCEL=True):
            self.assertEqual(views._client_ip(req), '9.9.9.9')
        with override_settings(ON_VERCEL=False):
            self.assertEqual(views._client_ip(req), '127.0.0.1')

    @override_settings(GOOGLE_API_KEY='test-key')
    def test_key_is_never_in_the_response(self):
        with mock.patch.object(views, '_call_gemini', side_effect=OSError('boom')):
            r = self.post({'messages': [{'role': 'user', 'text': 'hi'}]})
        self.assertNotIn('test-key', r.content.decode())
