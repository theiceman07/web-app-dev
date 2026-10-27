# FoleyCraft

Place sound around a listener and hear it in 3D. A Django site serving a React + Vite app, with a Gemini-powered assistant.

## Run it

```bash
python3 -m venv env_site && source env_site/bin/activate
pip install django
cd arjun_project
cp .env.example .env        # then put your key in GOOGLE_API_KEY
python manage.py runserver  # http://127.0.0.1:8000/
```

The built frontend is committed (`arjun_app/statics`, `arjun_app/template/index.html`), so Node is only needed to change the UI:

```bash
cd arjun_project/arjun_app/frontend
npm install
npm run build   # type-checks, builds, and copies the output into Django
```

## Pages

- `/` the landing page and studio (`#landing`, `#studio`)
- `/status/` every status page (202, 400, 401, 403, 404, 405, 408, 410, 413, 429, 500, 502, 503, 504); `/status/<code>/` answers with that real HTTP code
- `/api/assistant/` POST endpoint that proxies the Gemini API; the key stays on the server

## Settings (`arjun_project/.env`)

| Name | Purpose |
| --- | --- |
| `GOOGLE_API_KEY` | Gemini API key for the assistant. Never commit it. |
| `GEMINI_MODEL` | Optional. Defaults to `gemini-2.5-flash`, with fallbacks. |
| `DJANGO_SECRET_KEY` | Set this for any real deployment. |
| `DJANGO_DEBUG` | `0` in production. |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hosts, required when debug is off. |

## Tests

```bash
cd arjun_project && python manage.py test
```
