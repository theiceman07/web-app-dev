"""Request logging: one JSON line per request on stdout (Vercel shows these in Logs),
plus a small in-memory list of recent requests for the health page."""
import hashlib
import json
import logging
import time
import uuid
from collections import deque

from django.conf import settings

log = logging.getLogger('foleycraft.requests')

# Most recent requests handled by this process (newest first). Per instance only.
RECENT = deque(maxlen=40)

_SKIP_PREFIXES = ('/static/',)


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if settings.ON_VERCEL and forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', 'unknown')


class RequestLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith(_SKIP_PREFIXES):
            return self.get_response(request)

        request_id = request.META.get('HTTP_X_VERCEL_ID') or uuid.uuid4().hex[:12]
        start = time.perf_counter()
        status = 500
        try:
            response = self.get_response(request)
            status = response.status_code
            response['X-Request-ID'] = request_id
            return response
        finally:
            entry = {
                'time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'id': request_id,
                'method': request.method,
                'path': request.path,
                'status': status,
                'ms': round((time.perf_counter() - start) * 1000, 1),
                # Hashed so logs never contain a raw IP address.
                'client': hashlib.sha256((_client_ip(request) + settings.SECRET_KEY).encode()).hexdigest()[:10],
            }
            RECENT.appendleft(entry)
            level = logging.ERROR if status >= 500 else logging.WARNING if status >= 400 else logging.INFO
            log.log(level, json.dumps(entry))


class ErrorPageMiddleware:
    """Makes sure every code in the catalogue can really be served:

    - ?simulate=<code> on any URL answers with that code (HTML page, or JSON under /api/),
      so 502, 504, 408 and the rest can be demonstrated on the live site. ?simulate=offline
      shows the no-connection page. Turned off with ERROR_SIMULATION=0.
    - A request body over DATA_UPLOAD_MAX_MEMORY_SIZE gets 413 before any view reads it.
    - Django's bare 405 responses (from require_POST and friends) get the styled 405 page.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        simulate = request.GET.get('simulate', '').strip()
        if simulate and settings.ERROR_SIMULATION:
            return self._simulated(request, simulate)

        try:
            length = int(request.META.get('CONTENT_LENGTH') or 0)
        except ValueError:
            length = 0
        if settings.DATA_UPLOAD_MAX_MEMORY_SIZE and length > settings.DATA_UPLOAD_MAX_MEMORY_SIZE:
            return self._error(request, '413')

        response = self.get_response(request)
        if response.status_code == 405 and not response.content:
            styled = self._error(request, '405')
            if response.has_header('Allow'):
                styled['Allow'] = response['Allow']
            return styled
        return response

    def _simulated(self, request, code):
        from .errors import get_error
        from .views import offline

        code = 'FC-000' if code.lower() == 'offline' else code.upper()
        if get_error(code) is None:
            code = '404'
        if code == 'FC-000' and not request.path.startswith('/api/'):
            response = offline(request)
        else:
            response = self._error(request, code)
        response['X-Simulated-Error'] = code
        return response

    def _error(self, request, code):
        # Imported here: views imports RECENT from this module.
        from .errors import get_error
        from .views import _error, render_status

        if request.path.startswith('/api/'):
            e = get_error(code)
            kind = e['title'].lower().replace(' ', '_')
            return _error(e['http'], kind, e['message'], code if code.startswith('FC-') else None)
        return render_status(request, code)
