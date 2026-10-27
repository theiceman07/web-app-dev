"""The site's error-code catalogue.

One place defines every code, so the status pages, the error-codes page and the
assistant's explanations always agree. Keys are strings: HTTP codes ("404") plus
site-specific codes ("FC-100").
"""

# tone: error (client), warn (server/limits), info (not an error)
ERROR_CODES = {
    '202': dict(
        http=202, title='Accepted', tone='info', headline='Got it. We are on it.',
        message='The request was accepted for processing but is not finished yet. Nothing is wrong.',
        cause='Used for work that finishes later, such as saving feedback.',
        fix='Nothing to do. You do not need to send it again.',
    ),
    '400': dict(
        http=400, title='Bad request', tone='error', headline='That did not make sense.',
        message='The server could not understand the request. Check what was sent and try again.',
        cause='A form field or message was empty, too long, or in the wrong format.',
        fix='Check the fields you filled in, then submit again.',
    ),
    '401': dict(
        http=401, title='Unauthorized', tone='error', headline='Who goes there?',
        message='You need to provide your details before you can open this.',
        cause='A ticket lookup was sent without the email address used for the ticket.',
        fix='Enter the ticket reference and the email address you used when you created it.',
    ),
    '403': dict(
        http=403, title='Forbidden', tone='error', headline='This room is closed.',
        message='You do not have permission to open this page.',
        cause='The email does not match the ticket, or a form was sent from an expired page (CSRF check).',
        fix='Use the email address from the ticket, or reload the page and try again.',
    ),
    '404': dict(
        http=404, title='Not found', tone='error', headline='No sound here.',
        message='The page you asked for does not exist, or it has moved.',
        cause='The address has a typo, or the page was removed. A ticket reference that does not exist also gives 404.',
        fix='Check the address, or go back to the home page.',
    ),
    '405': dict(
        http=405, title='Method not allowed', tone='error', headline='Wrong way in.',
        message='This address does not accept that kind of request.',
        cause='A page that only accepts POST was opened directly in the browser.',
        fix='Use the form or button on the site instead of typing the address.',
    ),
    '408': dict(
        http=408, title='Request timeout', tone='error', headline='Too quiet for too long.',
        message='The server gave up waiting for the request. Try again.',
        cause='The connection was too slow or was interrupted.',
        fix='Check your connection and try again.',
    ),
    '410': dict(
        http=410, title='Gone', tone='error', headline='It was here once.',
        message='This page has been removed for good.',
        cause='The page was deleted on purpose.',
        fix='Use the navigation to find what you need.',
    ),
    '413': dict(
        http=413, title='Payload too large', tone='error', headline='That is too much at once.',
        message='The request was bigger than the server accepts.',
        cause='A message or form was longer than the limit.',
        fix='Shorten the text and send it again.',
    ),
    '429': dict(
        http=429, title='Too many requests', tone='warn', headline='Slow down a little.',
        message='You sent a lot of requests in a short time. Wait a minute and try again.',
        cause='The assistant allows 20 messages a minute and the support form 5 tickets a minute.',
        fix='Wait about a minute, then try again.',
    ),
    '500': dict(
        http=500, title='Server error', tone='warn', headline='The studio crashed.',
        message='Something broke on our side. It is not your fault. Try again in a moment.',
        cause='An unexpected error happened on the server.',
        fix='Reload the page. If it keeps happening, ask the assistant to open a support ticket.',
    ),
    '502': dict(
        http=502, title='Bad gateway', tone='warn', headline='A signal got lost.',
        message='A service we depend on sent back something we could not use.',
        cause='An outside service, such as the AI service, returned an error.',
        fix='Try again in a moment.',
    ),
    '503': dict(
        http=503, title='Service unavailable', tone='warn', headline='We are offline for a moment.',
        message='The service is down or not set up yet. Try again shortly.',
        cause='A required service, such as the database, is unreachable or not configured.',
        fix='Try again shortly. The Health page shows which service is down.',
    ),
    '504': dict(
        http=504, title='Gateway timeout', tone='warn', headline='The echo never came back.',
        message='A service we depend on took too long to answer.',
        cause='An outside service did not answer within its time limit.',
        fix='Try again in a moment.',
    ),
    # Site-specific code: raised by the assistant, never by the web server.
    'FC-100': dict(
        http=503, title='Assistant degraded', tone='warn', headline='The AI took too long.',
        message='The assistant could not reach its AI service in time, so it answered from the FAQ instead.',
        cause='The Gemini API timed out, was rate limited, or is not configured.',
        fix='The answer you got comes straight from our FAQ. If it does not help, the assistant opens a support ticket for you.',
    ),
}

# The codes named in the project brief, for quick checks and for the footer.
REQUIRED_CODES = ['400', '401', '403', '404', '429', '500', '503', 'FC-100']


def _row_to_dict(row):
    return dict(
        http=row.http_status, title=row.title, tone=row.tone, headline=row.headline,
        message=row.message, cause=row.cause, fix=row.fix, site_specific=row.is_site_specific,
    )


def all_errors():
    """Every error code, as {code: details}. Read from the SQL database; if the database
    cannot be reached (for example while it is the thing that is broken) the built-in
    table above is used, so error pages always render."""
    try:
        from .models import ErrorCode

        rows = list(ErrorCode.objects.all())
        if rows:
            return {r.code: _row_to_dict(r) for r in rows}
    except Exception:  # any database problem: fall back
        pass
    return dict(ERROR_CODES)


def get_error(code):
    code = str(code).upper()
    try:
        from .models import ErrorCode

        row = ErrorCode.objects.filter(code=code).first()
        if row:
            return _row_to_dict(row)
    except Exception:
        pass
    return ERROR_CODES.get(code)


def error_table_text():
    """The catalogue as plain text, for the assistant's prompt."""
    lines = []
    for code, e in all_errors().items():
        lines.append(f"{code} {e['title']}: {e['message']} Cause: {e['cause']} Fix: {e['fix']}")
    return '\n'.join(lines)
