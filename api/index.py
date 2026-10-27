"""Vercel entrypoint: exposes the Django WSGI app as `app`.

vercel.json rewrites every request that is not a static file to this function.
"""
import os
import sys
from pathlib import Path

# The Django project lives in ./arjun_project, one level below the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'arjun_project'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'arjun_project.settings')

from arjun_project.wsgi import application  # noqa: E402

app = application
