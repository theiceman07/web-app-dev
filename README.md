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

## Deploy on Vercel

The repo is ready for Vercel as-is: `vercel.json` routes everything to the Django function in `api/index.py`, `requirements.txt` and `.python-version` tell Vercel what to install, and the built frontend is served from `public/static/`.

1. Import the repo at vercel.com/new. Leave **Root Directory** as the repo root and Framework Preset as **Other**. Do not override the build or install commands: `vercel.json` already runs `npm ci` and the Vite build for you. Use Node 22 or newer (Project Settings, General, Node.js Version).
2. Add these **Environment Variables** (Project Settings, Environment Variables):

   | Name | Value |
   | --- | --- |
   | `DJANGO_SECRET_KEY` | a long random string, for example `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
   | `GOOGLE_API_KEY` | your Gemini API key |
   | `DJANGO_CSRF_TRUSTED_ORIGINS` | only if you add a custom domain, e.g. `https://example.com` |
   | `DJANGO_ALLOWED_HOSTS` | only if you add a custom domain, e.g. `example.com` |

   `*.vercel.app` hosts work without the last two. The site refuses to start without `DJANGO_SECRET_KEY`.
3. Optional but recommended: in the project's **Storage** tab, add an **Upstash Redis** database. Vercel then sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`, and the assistant's 20-requests-a-minute limit becomes shared across all serverless instances. Without it the limit is per instance, so it is only a soft limit.
4. Deploy. Every deploy rebuilds the frontend, so UI changes need no extra step. The built files are also committed (`public/static`, `arjun_app/statics`, `arjun_app/template/index.html`) so local runs work without Node.

Notes: the site has no database, accounts or admin. If the shared store is unreachable the limiter falls back to the per-instance counter, so the assistant keeps working.

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
