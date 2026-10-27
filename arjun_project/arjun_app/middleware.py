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
