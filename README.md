# Rush Republic — Instagram Post / Reel Scheduler (Working POC)

A full-stack proof of concept for an internal Instagram scheduling tool:
**React frontend, Django + DRF backend, MySQL, Celery + Redis for background
publishing, and a Meta Graph API service layer** built to the current
Content Publishing spec.

> **Backend update:** the API now runs on Node.js + Express (`backend-node/`) with the same
> MySQL database and React frontend. See **section 4** to run it; the Django description in
> sections 1–3 and 4b is the legacy/rollback version.

> See **`POC_TEST_REPORT.md`** for exactly what has been verified, how, and
> what's still blocked pending Docker Desktop + your Meta credentials.

---

## 1. Architecture

```
React (Vite, :5173)
   │  JWT (access + refresh)
   ▼
Django + DRF (:8000)
   │
   ├── accounts/            auth (login/logout/me), per-user settings
   ├── instagram_accounts/  InstagramAccount model, Meta OAuth, services/
   │     └── services/      meta_client.py, account_service.py,
   │                        publishing_service.py, insights_service.py
   ├── scheduler/           MediaFile, ScheduledContent, Celery task,
   │                        dashboard/calendar/content endpoints
   └── analytics_app/       InstagramInsight (real Meta data only)
   │
   ▼
MySQL (:3306, Docker)          Redis (:6379, Docker)
                                     │
                                Celery worker
                                     │
                                Meta Graph API
```

---

## 2. File structure

```
Instagram-Scheduler/
│
├── docker-compose.yml         MySQL + Redis for local dev
├── POC_TEST_REPORT.md         What's verified, how, and what's blocked
│
├── frontend/
│   ├── index.html, package.json, vite.config.js
│   ├── public/assets/logo.png
│   └── src/                    React app (unchanged UI from the frontend phase)
│       ├── api/                  authApi, contentApi, instagramApi, dashboardApi,
│       │                         calendarApi, analyticsApi, settingsApi, httpClient
│       ├── context/               AuthContext, AppDataContext, ModalContext, ToastContext
│       └── components/, pages/, styles/, utils/, hooks/useApiData.js
│
└── backend/
    ├── manage.py
    ├── requirements.txt
    ├── .env.example            copy to .env and fill in — never commit .env
    ├── config/                 settings.py, urls.py, celery.py
    ├── accounts/                User settings, login/logout/me, JWT
    ├── instagram_accounts/      InstagramAccount model + Meta services/
    ├── scheduler/                MediaFile, ScheduledContent, Celery task, validators
    └── analytics_app/            InstagramInsight, real-data-only analytics endpoint
```

---

## 3. First-time setup

### 3.1 Install Docker Desktop — **done** ✓

Already installed and verified working on this machine. For reference, if
setting this up on another machine and Docker Desktop shows **"Virtualization
support not detected"** on first launch (common when WSL2 prerequisites
aren't enabled yet, even with virtualization on in the BIOS/firmware), fix it
with, in an **Administrator** PowerShell:

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

Then reboot, and in a normal PowerShell:

```powershell
wsl --set-default-version 2
wsl --update
```

Then launch Docker Desktop again — it should show "Engine running".

**Note on port 3306:** this machine already has a native MySQL server bound
to port 3306, so `docker-compose.yml` maps the Dockerized MySQL to host port
**3307** instead (container-internal port is still 3306). `backend/.env`'s
`DB_PORT=3307` already matches — no action needed unless you're setting this
up somewhere without that conflict, in which case 3306 works fine too.

### 3.2 Backend environment

```powershell
cd "C:\Intern React\Instagram-Scheduler\backend"
.\venv\Scripts\Activate.ps1        # venv already created; if missing: python -m venv venv
pip install -r requirements.txt
copy .env.example .env             # if you don't already have one
```

Edit `backend\.env`:
- Fill in `META_APP_ID` and `META_APP_SECRET` from your Meta Developer App (never paste these in chat with me).
- Leave `META_PUBLISHING_ENABLED=False` until you are deliberately ready for a live test.
- Everything else has sane local-dev defaults already.

### 3.3 Meta App configuration (in the Meta Developer dashboard)

- Add the **Facebook Login for Business** product to your app.
- Valid OAuth Redirect URI: `http://localhost:8000/api/instagram/oauth/callback/`
- Required scopes (already requested by the backend): `pages_show_list`,
  `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`,
  `business_management`.
- Your Facebook Page must have a linked Instagram **Professional** (Business
  or Creator) account for the connect flow to find anything.

### 3.4 Making uploaded media reachable by Meta (Reels/Posts publishing only)

Meta's servers fetch your media by URL — `localhost` is not reachable from
Meta's side. For any real publish test, tunnel your backend with something
like `ngrok http 8000` and set `PUBLIC_MEDIA_BASE_URL` in `.env` to the
resulting `https://...ngrok-free.app` URL. Not needed for scheduling/DB
testing — only for an actual Meta publish call.

---

## 4. Running locally with the Node.js backend (current — Git Bash / terminal)

The backend now lives in `backend-node/` (Node + Express). It uses the **same MySQL
database and schema** as the Django version, and needs **no Redis / Celery**.
Prerequisites: Node 18+ (20/22 recommended), Docker Desktop, npm.

> Do **not** run the Django server or Celery worker at the same time — stop them first.
> Branch: `git checkout node-backend-migration`

### 4.1 One-time setup

```bash
cd "/c/Intern React/Instagram-Scheduler"

# 1) Start MySQL only (host port 3307). Redis is no longer needed.
docker compose up -d mysql

# 2) Install backend dependencies
cd backend-node
npm install

# 3) Create the backend env file
cp .env.example .env
```

Edit `backend-node/.env` (copy the secrets from your existing `backend/.env`):

```ini
NODE_ENV=development
PORT=8000                     # same port the frontend already calls, so no frontend change is needed
DJANGO_SECRET_KEY=...         # SAME value as backend/.env
FIELD_ENCRYPTION_KEY=...      # SAME value as backend/.env (needed to read stored Instagram tokens)
DB_NAME=rush_scheduler
DB_USER=rush_user
DB_PASSWORD=...               # SAME as backend/.env
DB_HOST=127.0.0.1
DB_PORT=3307
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
FRONTEND_URL=http://localhost:5173
META_APP_ID=...               # optional until you test "Connect account"
META_APP_SECRET=...
META_REDIRECT_URI=http://localhost:8000/api/instagram/oauth/callback/
META_PUBLISHING_ENABLED=False # keep False until you deliberately test a real publish
MEDIA_ROOT=../backend/media   # reuse the already-uploaded media
AUTH_REQUIRED=false           # no sign-in page; requests act as the default user
DEFAULT_USER_EMAIL=admin@rushrepublic.com
```

If the database is brand new (empty), create the tables once with the legacy Django
migrations, then seed the demo user (this only creates tables; it is not needed on your
existing database):

```bash
cd ../backend && source venv/Scripts/activate && python manage.py migrate && deactivate
cd ../backend-node && npm run seed-demo-user
```

### 4.2 Start everything (two terminals)

**Terminal 1 — backend** (also runs the scheduler, polling every 30 s)

```bash
cd "/c/Intern React/Instagram-Scheduler/backend-node"
npm run dev
# expected: "Rush Republic API listening on port 8000"
```

**Terminal 2 — frontend**

```bash
cd "/c/Intern React/Instagram-Scheduler/frontend"
npm install
npm run dev
```

### 4.3 View the tool

Open **http://localhost:5173** — there is no sign-in page; the tool opens directly on the
Dashboard. (The backend runs with `AUTH_REQUIRED=false` and acts as the default workspace
user `admin@rushrepublic.com`. Set `AUTH_REQUIRED=true` in `backend-node/.env` to require
token auth again.)

> **Security:** with no sign-in, anyone who can reach the site controls the scheduler and the
> connected Instagram accounts. Fine locally; on Hostinger protect the site (e.g. hPanel →
> Password Protect Directories).

### 4.4 Check that it works

```bash
# Backend is up
curl http://localhost:8000/api/health/            # {"status":"ok"}

# Returns the default workspace user (no token needed)
curl http://localhost:8000/api/auth/me/

# Run the automated tests (unit tests; no database needed)
cd "/c/Intern React/Instagram-Scheduler/backend-node" && npm test
```

Manual checklist in the browser:
1. The app opens straight on the Dashboard (no login page) and shows counts.
2. Create a Post (JPG/PNG) or Reel (MP4/MOV), scheduled a few minutes ahead → appears under **Scheduled** and on the **Calendar**.
3. Edit the caption/time, or Cancel it → status changes.
4. With `META_PUBLISHING_ENABLED=False`, a due item moves to **Failed** with the message
   "META_PUBLISHING_ENABLED is False…" — that is the expected safety behaviour. **Retry** re-runs it.
5. Settings → change timezone/notifications and reload; values persist.
6. Accounts → "Connect" needs real `META_APP_ID`/`META_APP_SECRET`; publishing to Instagram
   additionally needs `PUBLIC_MEDIA_BASE_URL` (e.g. `ngrok http 8000`) and `META_PUBLISHING_ENABLED=True`.

Run the due-jobs scheduler once by hand (what the Hostinger cron job does):

```bash
cd "/c/Intern React/Instagram-Scheduler/backend-node" && npm run run-due-jobs
```

Full details, API mapping, Hostinger deployment and rollback: `backend-node/docs/MIGRATION.md`.

---

## 4b. Legacy: running the Django backend (Windows / PowerShell)

Kept as the rollback path. Not needed when using the Node backend above.

Five terminals, in order:

**Terminal 1 — MySQL + Redis (Docker)**
```powershell
cd "C:\Intern React\Instagram-Scheduler"
docker compose up
```

**Terminal 2 — Django migrations + server** (first run only: migrate + seed)
```powershell
cd "C:\Intern React\Instagram-Scheduler\backend"
.\venv\Scripts\Activate.ps1
python manage.py migrate
python manage.py seed_demo_user
python manage.py createsuperuser   # optional, for /admin/
python manage.py runserver
```
admin@rushrepublic.com
admin123

**Terminal 3 — Celery worker**
```powershell
cd "C:\Intern React\Instagram-Scheduler\backend"
.\venv\Scripts\Activate.ps1
celery -A config worker --pool=solo -l info
```
(`--pool=solo` is required on Windows — Celery's default prefork pool doesn't work there.)

**Terminal 4 — (optional) ngrok, only when doing a real Meta publish test**
```powershell
ngrok http 8000
# copy the https URL into backend\.env as PUBLIC_MEDIA_BASE_URL, restart Terminal 2
```

**Terminal 5 — React**
```powershell
cd "C:\Intern React\Instagram-Scheduler\frontend"
npm install
npm run dev 
# open http://localhost:5173
```

### Login
```
Email:    admin@rushrepublic.com
Password: admin123
```
(Created by `python manage.py seed_demo_user` in Terminal 2.)

---

## 5. What's real vs. what's still gated

| Area | Status |
|---|---|
| Login/logout/JWT, per-user data isolation | **Real**, working against the Django backend |
| Instagram account storage, token encryption, never exposed to frontend | **Real** |
| Local media upload → Django `MEDIA_ROOT`, validated (extension/MIME/size/signature) | **Real** |
| Scheduling → MySQL row, correct timezone handling | **Real** (once MySQL is running via Docker) |
| Celery task logic (status transitions, error handling) | **Real** — verified synchronously; real async worker execution needs Terminal 1+3 running |
| Meta OAuth connect flow | **Real code**, needs your `META_APP_ID`/`SECRET` + a real browser consent to exercise |
| Meta publishing (Posts/Reels) | **Real code**, deliberately blocked by `META_PUBLISHING_ENABLED=False` until you explicitly flip it |
| Analytics | **Real Meta Graph API calls only** — never fabricates numbers; shows "No data available" when nothing's published yet |

See `POC_TEST_REPORT.md` for the full PASS/FAIL/BLOCKED matrix and exactly how each row was tested.

**No secrets, tokens, or API keys exist anywhere in this codebase or in chat history with me.**
