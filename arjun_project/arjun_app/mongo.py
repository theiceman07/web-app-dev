"""MongoDB storage for chat logs and feedback.

Support tickets and FAQs live in the SQL database; conversational data lives here.
Every call has short timeouts and never raises: if MongoDB is missing or slow, the
site keeps working and `insert` just reports False.
"""
import logging
from datetime import datetime, timezone

from django.conf import settings

log = logging.getLogger('foleycraft.mongo')

CHAT_LOGS = 'chat_logs'
FEEDBACK = 'feedback'

_client = None


def configured():
    return bool(settings.MONGODB_URI)


def _db():
    global _client
    if not configured():
        return None
    if _client is None:
        from pymongo import MongoClient

        _client = MongoClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=2500,
            connectTimeoutMS=2500,
            socketTimeoutMS=3000,
            appname='foleycraft',
        )
    return _client[settings.MONGODB_DB]


def insert(collection, doc):
    """Store one document. Returns True if it was saved, False otherwise (never raises)."""
    try:
        db = _db()
        if db is None:
            return False
        db[collection].insert_one({**doc, 'created_at': datetime.now(timezone.utc)})
        return True
    except Exception as exc:  # pymongo raises many error types; none may break a request
        log.warning('mongo insert into %s failed: %s', collection, exc.__class__.__name__)
        return False


def ping():
    """Return (status, detail) for the health page. status is 'ok', 'down' or 'not_configured'."""
    if not configured():
        return 'not_configured', 'MONGODB_URI is not set'
    try:
        _db().command('ping')
        return 'ok', f'database "{settings.MONGODB_DB}" reachable'
    except Exception as exc:
        return 'down', exc.__class__.__name__
