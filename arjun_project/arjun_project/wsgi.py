"""
WSGI config for arjun_project project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/4.2/howto/deployment/wsgi/
"""

import logging
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'arjun_project.settings')

application = get_wsgi_application()


def _apply_pending_migrations():
    """Create the tables and seed the FAQs on first start.

    Serverless deployments have no release step, so a fresh database (or a new
    /tmp SQLite file on every cold start) is brought up to date here. Set
    AUTO_MIGRATE=0 to turn this off and run `manage.py migrate` yourself.
    """
    if os.environ.get('AUTO_MIGRATE', '1') == '0':
        return
    try:
        from django.core.management import call_command
        from django.db import connection
        from django.db.migrations.executor import MigrationExecutor

        executor = MigrationExecutor(connection)
        if executor.migration_plan(executor.loader.graph.leaf_nodes()):
            call_command('migrate', interactive=False, verbosity=0)
    except Exception:  # the site must still start; /health/ reports a database problem
        logging.getLogger('foleycraft').exception('Automatic migration failed')


_apply_pending_migrations()
