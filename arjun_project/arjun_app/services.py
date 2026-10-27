"""FAQ search, error-code lookup and the weather API client."""
import json
import logging
import re
import time
import urllib.parse
import urllib.request

from django.conf import settings
from django.core.cache import cache

from .errors import all_errors, get_error
from .models import FAQ

log = logging.getLogger('foleycraft.services')

# ---------------------------------------------------------------------------
# FAQ search (used when the AI cannot or may not answer)
# ---------------------------------------------------------------------------

_STOP = set(
    'a an and are as at be but by can do does for from how i if in is it its me my of on or so that the this to was '
    'we what when where which who why will with you your please tell about get got there any'.split()
)


def _tokens(text):
    out = set()
    for w in re.findall(r'[a-z0-9]+', (text or '').lower()):
        if w in _STOP or len(w) < 2:
            continue
        out.add(w[:-1] if len(w) > 3 and w.endswith('s') else w)
    return out


def search_faqs(question, limit=3, min_score=4):
    """Return [(score, FAQ), ...] best first. Questions and keywords weigh more than answers."""
    q = _tokens(question)
    if not q:
        return []
    scored = []
    for faq in FAQ.objects.filter(is_published=True):
        head = _tokens(faq.question) | _tokens(faq.keywords.replace(',', ' '))
        body = _tokens(faq.answer)
        hits_head = len(q & head)
        score = 3 * hits_head + len(q & body)
        if hits_head and score >= min_score:
            scored.append((score, faq))
    scored.sort(key=lambda s: (-s[0], s[1].position))
    return scored[:limit]


def faq_context_text():
    """All published FAQs as plain text, for the assistant's prompt."""
    return '\n'.join(f'Q: {f.question}\nA: {f.answer}' for f in FAQ.objects.filter(is_published=True))


# ---------------------------------------------------------------------------
# Error-code questions
# ---------------------------------------------------------------------------

_CODE_RE = re.compile(r'\b(?:FC[- ]?\d{3}|[1-5]\d{2})\b', re.I)


def find_error_code(text):
    """Return the first known error code mentioned in `text`, or None."""
    known = all_errors()
    for m in _CODE_RE.finditer(text or ''):
        raw = m.group(0).upper().replace(' ', '-')
        if raw.startswith('FC') and '-' not in raw:
            raw = 'FC-' + raw[2:]
        if raw in known:
            return raw
    return None


def explain_error(code):
    e = get_error(code)
    return (
        f"{code} means \"{e['title']}\". {e['message']} Why it happens: {e['cause']} What to do: {e['fix']}"
    )


# ---------------------------------------------------------------------------
# Open-Meteo weather API (third-party, no key) with a hard time limit and a fallback
# ---------------------------------------------------------------------------

WEATHER_URL = 'https://api.open-meteo.com/v1/forecast'
WEATHER_TIMEOUT_S = 3
FALLBACK_SCENE = ('cozy_tavern', 'The weather service did not answer in time, so here is a cosy default.')


def _scene_for(code, is_day):
    if code in (95, 96, 99):
        return 'thunderstorm', 'Thunder nearby'
    if code in (51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82):
        return 'cyberpunk_alley', 'Rain outside'
    if code in (71, 73, 75, 77, 85, 86):
        return 'dungeon_crypt', 'Snow and cold'
    if code in (45, 48):
        return 'cave_drips', 'Fog'
    if code in (0, 1):
        return ('enchanted_forest', 'Clear daytime sky') if is_day else ('ocean_night', 'Clear night sky')
    return 'cozy_tavern', 'Cloudy'


def weather_scene(lat=None, lon=None):
    """Suggest a scene for the weather. Always returns a result: on timeout or error it
    returns the fallback scene with fallback=True, so the page never waits on the API."""
    try:
        lat = float(settings.WEATHER_DEFAULT_LAT if lat is None else lat)
        lon = float(settings.WEATHER_DEFAULT_LON if lon is None else lon)
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError('coordinates out of range')
    except (TypeError, ValueError):
        lat, lon = settings.WEATHER_DEFAULT_LAT, settings.WEATHER_DEFAULT_LON

    key = f'weather:{round(lat, 1)}:{round(lon, 1)}'
    cached = cache.get(key)
    if cached:
        return {**cached, 'cached': True}

    started = time.perf_counter()
    query = urllib.parse.urlencode({'latitude': lat, 'longitude': lon, 'current': 'temperature_2m,weather_code,is_day'})
    try:
        with urllib.request.urlopen(f'{WEATHER_URL}?{query}', timeout=WEATHER_TIMEOUT_S) as resp:
            current = json.loads(resp.read().decode('utf-8'))['current']
        scene, reason = _scene_for(int(current['weather_code']), bool(current.get('is_day', 1)))
        result = {
            'scene': scene,
            'reason': f"{reason}, {round(current['temperature_2m'])}°C",
            'source': 'open-meteo',
            'fallback': False,
            'ms': round((time.perf_counter() - started) * 1000),
        }
        cache.set(key, result, 600)
        return {**result, 'cached': False}
    except (OSError, ValueError, KeyError, TypeError) as exc:
        log.warning('weather API failed (%s); using fallback scene', exc.__class__.__name__)
        return {
            'scene': FALLBACK_SCENE[0],
            'reason': FALLBACK_SCENE[1],
            'source': 'fallback',
            'fallback': True,
            'ms': round((time.perf_counter() - started) * 1000),
            'cached': False,
        }
