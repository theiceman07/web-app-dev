# FoleyCraft

Place sound around a listener and hear it in 3D. FoleyCraft is a Django site with a React studio, a support
assistant powered by Google Gemini, and a SQL + MongoDB back end.

**Live site: https://web-app-dev-one.vercel.app**

Try an address that does not exist, such as https://web-app-dev-one.vercel.app/no-such-page, to see the custom 404 page.

## Pages

| Page | Address | What it does |
| --- | --- | --- |
| Home | `/` | Landing page with a live 3D stage, scenes, and a weather-based scene suggestion |
| Studio | `/#studio` | The sound-design studio (place sounds, rooms, WAV export) |
| FAQ | `/faq/` | 13 questions read from the SQL database, with search |
| Support | `/support/` | Ticket form and ticket status lookup |
| Error codes | `/status/` (also `/errors/`) | Every error the site can show, each served with its real HTTP status |
| Offline page | `/offline/`, `/sw.js` | Shown by the service worker (code **FC-000**) when the site is opened with no internet |
| Health | `/health/` (JSON: `/api/health/`) | Live status of the SQL database, MongoDB, AI service and weather API, plus recent requests |

The chat assistant is on every page, including the 404 and 500 pages.

## How each requirement is met

| Requirement | Where |
| --- | --- |
| Responsive site, 3+ pages, chat widget on every page | The pages above. Server-rendered pages share `template/base.html`, which loads the widget (`/static/assets/widget.js`); the home page and studio use the same component in the main bundle |
| 10+ FAQs in SQL, FAQ page from an API | `FAQ` model; 13 rows seeded by migration `0002_seed_faqs`. The FAQ page fetches them from the JSON API `GET /api/faqs/` (the server-rendered list is only a no-JavaScript fallback) |
| 8+ error codes stored in SQL, incl. one site-specific | `ErrorCode` model; 16 rows seeded by migrations `0004_seed_error_codes` and `0005_seed_offline_code`: 400, 401, 403, 404, 405, 408, 410, 413, 429, 500, 502, 503, 504, 202 and the site codes **FC-000** (no connection, shown by the service worker) and **FC-100** (AI unavailable, answered from the FAQ). Every code can be triggered for real with `?simulate=CODE` on any URL (JSON under `/api/`; off with `ERROR_SIMULATION=0`); 405, 410 (`/beta/`) and 413 (body over 1 MB) also happen on their own. The status pages, the error-codes page and the assistant all read them from SQL; `errors.py` keeps a built-in copy used only if the database cannot be reached, so error pages always render |
| Custom 404 and 500 pages with "Ask the assistant" | `template/status.html`, wired as `handler404` / `handler500` and a catch-all route; the button opens the chat widget with a ready-made question |
| Assistant answers from FAQ data, explains error codes, opens a ticket when it cannot answer | `views.assistant`. Error-code questions are answered from the catalogue. Other questions go to Gemini with the FAQ and error table in its prompt. If Gemini replies `NO_ANSWER`, or is slow or down and the FAQ search finds nothing, a ticket is created |
| Tickets in SQL with full CRUD | `Ticket` model (PostgreSQL via `DATABASE_URL`; SQLite locally). **Create:** the Support form or the assistant. **Read / Update / Delete:** `GET`, `PATCH`, `DELETE /api/tickets/<reference>/`, used by the "Check a ticket" panel on the Support page. The owner proves it is theirs with the ticket's email (`X-Ticket-Email`): 401 without it, 403 if wrong, 404 if the ticket does not exist |
| Chat logs and feedback in MongoDB | `arjun_app/mongo.py`: collections `chat_logs` and `feedback` (`/api/feedback/` returns 202 when saved) |
| API keys in environment variables, none in the repo | All secrets are read from the environment (`.env` is git-ignored; `.env.example` lists the names). A test scans the code for hard-coded keys |
| Request logging | `middleware.RequestLogMiddleware`: one JSON line per request (method, path, status, ms, request id, hashed client) on stdout, visible in Vercel Logs and on the Health page |
| Health check page | `/health/` and `/api/health/` (HTTP 503 when the SQL database is down) |
| Extra third-party API with time limit and fallback | Open-Meteo weather API (no key) in `services.weather_scene`: 3 second limit; on timeout or error the home page gets a default scene marked as a fallback. The Gemini call has its own limit (`GEMINI_TIMEOUT_S`, 9 s) with the FAQ as the fallback |

## Environment variables

Copy `arjun_project/.env.example` to `arjun_project/.env` for local use. On Vercel, add them under
Project Settings, Environment Variables.

| Name | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Required on Vercel. A long random string |
| `GOOGLE_API_KEY` | Gemini API key for the assistant |
| `DATABASE_URL` | PostgreSQL URL (Neon, Vercel Postgres) for FAQs and tickets. Without it SQLite is used, which on Vercel is wiped on every cold start |
| `MONGODB_URI` | MongoDB Atlas connection string for chat logs and feedback. Without it nothing is logged and feedback returns 503 |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Optional shared rate limit (Vercel's Upstash integration sets `KV_REST_API_*`) |

Tables are created and the FAQs seeded automatically on first start (`AUTO_MIGRATE=0` turns this off).

## Run it locally

```bash
python3 -m venv env_site && source env_site/bin/activate
pip install -r requirements.txt
cd arjun_project
cp .env.example .env        # fill in GOOGLE_API_KEY at least
python manage.py runserver  # http://127.0.0.1:8000/
python manage.py test       # 64 tests
```

The built frontend is committed, so Node is only needed to change the UI:

```bash
cd arjun_project/arjun_app/frontend
npm install && npm run build   # builds the app and the chat widget into Django's static files
```

## Deploy on Vercel

Import the repo at vercel.com/new, set Framework Preset to **Other**, leave the root directory alone and do not override
the build or install commands (`vercel.json` runs `npm ci` and the Vite build). Use Node 22 or newer. Add the
environment variables above and deploy. Every push to `main` redeploys.

## Proposed improvement

**Agent dashboard with semantic FAQ search.** Staff currently have no screen for the tickets that the assistant opens.
Add a login-protected dashboard that lists tickets, lets an agent reply by email and change the status, and shows the
questions people rated "not helpful" (already stored in MongoDB). Then replace the keyword FAQ fallback with embedding
search, so questions phrased differently from the FAQ still match, and turn frequently ticketed questions into new FAQs.

## Known limits

- The in-memory rate limit is per server instance unless the Upstash store is configured.
- Chat history is kept in the browser tab for the session; chat logs on the server are only kept if MongoDB is configured.
- Ticket replies are not sent yet: tickets are stored and can be looked up, but answering them needs the dashboard above.
