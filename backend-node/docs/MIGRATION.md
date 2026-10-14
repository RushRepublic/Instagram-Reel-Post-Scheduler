# Django → Node.js/Express migration — Rush Republic Instagram Scheduler

Only the backend changed. React frontend (`frontend/`), MySQL schema/data, UI, and API contract are untouched.
The original Django backend is still in `backend/` as the rollback.

## 1. Architecture

| | Before | After |
|---|---|---|
| API | Django 5 + DRF (`backend/`) | Express 4 (`backend-node/`) |
| Auth | simplejwt (HS256) + Django `auth_user` | Same token format/claims, same `auth_user` + `token_blacklist_*` tables, Django PBKDF2 hashes verified in Node |
| DB | MySQL via Django ORM | Same MySQL, same tables, via `mysql2` (parameterised queries). **No schema changes, no migrations.** |
| Token encryption | Fernet (`FIELD_ENCRYPTION_KEY`) | Same Fernet format (own ~40-line implementation, verified both directions against Python) |
| Background jobs | Celery + Redis (ETA tasks) | DB-driven scheduler (`src/jobs/runDueJobs.js`) — no Redis, no worker |
| Media | `MEDIA_ROOT`, served by Django only in DEBUG | `MEDIA_ROOT`, always served at `/media/` (Meta must fetch it) |
| Uploads | python-magic sniff | extension + declared MIME + size + file-signature check |

## 2. Component mapping

| Django | Node |
|---|---|
| `config/urls.py` | `src/app.js` |
| `accounts/views.py` | `src/routes/auth.js`, `src/lib/tokens.js`, `src/lib/djangoPassword.js` |
| `instagram_accounts/views.py` | `src/routes/instagram.js` |
| `instagram_accounts/services/*` | `src/services/{metaClient,accountService,publishingService,insightsService}.js` |
| `instagram_accounts/fields.py` | `src/lib/fernet.js` |
| `scheduler/views.py`, `serializers.py` | `src/routes/content.js`, `src/lib/serializers.js` |
| `scheduler/validators.py` | `src/lib/mediaValidation.js` |
| Django `FileSystemStorage` | `src/lib/mediaStorage.js` |
| `scheduler/tasks.py` (Celery) | `src/services/publisher.js` + `src/jobs/runDueJobs.js` |
| `seed_demo_user` command | `scripts/seed-demo-user.js` |
| `config/settings.py` | `src/config/env.js`, `src/config/db.js` |
| Django admin (`/admin/`) | **Not migrated** (not used by the frontend) |

## 3. API mapping (paths, methods, bodies, status codes and error shapes preserved)

| Method | Path | Auth | Express | Tested |
|---|---|---|---|---|
| POST | `/api/auth/login/` | – | `routes/auth.js` | ✅ |
| POST | `/api/auth/refresh/` | – | same (rotates refresh) | ✅ incl. Django-issued token |
| POST | `/api/auth/logout/` | JWT | same (blacklists, 205) | ✅ |
| GET/PATCH | `/api/auth/me/` | JWT | same | ✅ |
| GET | `/api/instagram/accounts/`, `/accounts/:id/` | JWT | `routes/instagram.js` | ✅ |
| GET | `/api/instagram/oauth/start/` | JWT | same | ✅ (URL shape only) |
| GET | `/api/instagram/oauth/callback/` | signed state | same | ⚠ only the invalid-state branch; success path needs real Meta |
| GET/POST | `/api/content/` | JWT | `routes/content.js` | ✅ |
| GET/PATCH | `/api/content/:id/` | JWT | same | ✅ |
| POST | `/api/content/:id/cancel/`, `/retry/` | JWT | same | ✅ |
| GET | `/api/dashboard/`, `/api/calendar/` | JWT | same | ✅ |
| GET | `/api/analytics/` | JWT | `routes/analytics.js` | ✅ empty case; ⚠ live Meta insights untested |
| GET | `/media/...` | – | `express.static` | ✅ |
| GET | `/api/health/` | – | new, trivial liveness probe | ✅ |

Known response differences (intentional/minor): `405` for wrong HTTP verbs becomes `404`; Django `/admin/` is gone; the OAuth `state` is a signed JWT instead of a Django-signing blob (only lives 10 min).

## 4. Scheduler (replaces Celery) — and the Hostinger limit

Hostinger's docs say Node.js apps on Web/Cloud plans run **on demand** and are stopped after a period without traffic ([docs](https://docs.hostinger.com/node.js/overview)); cron jobs are creatable from hPanel on Web/Cloud plans. So a persistent worker is **not** guaranteed. Design:

* Schedules live in MySQL (`status='SCHEDULED'`, `scheduled_at`). Nothing depends on memory or Redis.
* `scripts/run-due-jobs.js` publishes everything due, then exits → **run it from an hPanel cron job every minute** (this is the reliable trigger).
* The web app also polls every `SCHEDULER_POLL_SECONDS` while it is awake, and "publish now"/retry fire immediately.
* **No duplicate publishing:** every path goes through one atomic `UPDATE … SET status='PROCESSING' WHERE id=? AND status='SCHEDULED'`; only the process whose UPDATE changes the row proceeds. Cancel/edit are guarded the same way. (Verified: 10 concurrent claims → exactly 1 winner.)
* Added (not in Django): rows stuck in `PROCESSING` > `STUCK_PROCESSING_MINUTES` (process killed mid-publish) are marked `FAILED` so they are visible. Check Instagram before pressing Retry on such a row.
* ⚠ Reel publishing polls Meta for up to ~5 min inside one process. If Hostinger kills long cron processes, long reels may be marked FAILED by the rule above — confirm Hostinger's cron time limit with support.
* **Do not run Celery and the Node scheduler at the same time** — Celery's task has no atomic claim and could double-publish.

## 5. Environment variables
See `.env.example`. Names are unchanged from Django where they existed (`DJANGO_SECRET_KEY`, `FIELD_ENCRYPTION_KEY` — **both must be the same values as the Django deployment**, `DB_*`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, `META_*`, `PUBLIC_MEDIA_BASE_URL`). Dropped: `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DB_ROOT_PASSWORD`, `REDIS_URL`, `CELERY_*`. New: `PORT`, `MEDIA_ROOT`, `JWT_SECRET` (optional override), `ENABLE_INPROCESS_SCHEDULER`, `SCHEDULER_POLL_SECONDS`, `STUCK_PROCESSING_MINUTES`.

## 6. Run locally
```powershell
# MySQL (existing docker-compose; Redis no longer needed)
cd "C:\Intern React\Instagram-Scheduler"; docker compose up mysql
# Backend
cd backend-node; npm install; copy .env.example .env   # copy values from backend\.env; set NODE_ENV=development, DB_PORT=3307, MEDIA_ROOT=..\backend\media
npm run dev                                              # http://localhost:3000
# Frontend (point it at Node — only an env var, no code change)
cd ..\frontend; $env:VITE_API_BASE_URL="http://localhost:3000/api"; npm run dev
```
Stop `manage.py runserver` and the Celery worker first, or use different ports and never run both schedulers against one DB.
The OAuth redirect URI is configured in the Meta app: update it if the API host/port changes.

## 7. Deploy on Hostinger Business (verify each step in hPanel — I could not access your account)
1. **Database:** hPanel → Databases → create/import. Export the current DB (`mysqldump`) and import it; or point `DB_HOST/DB_*` at an existing MySQL. Don't run Django migrations again; the schema is already the Django one.
2. **Frontend:** `cd frontend; VITE_API_BASE_URL=https://api.your-domain.com/api npm run build`, upload `dist/` to `public_html`. If the site uses client-side routes (`/app/accounts`), add an `.htaccess` that rewrites unknown paths to `index.html`.
3. **API:** hPanel → Websites → Add website → Node.js Web App; upload `backend-node/` (zip or GitHub), Node 20/22 LTS, start file `src/server.js` (or `npm start`). Set the env vars from §5 in the app's environment settings (don't upload `.env`). Hostinger supplies `PORT`.
4. **Media:** set `MEDIA_ROOT` to a folder **outside** the deployed app directory (e.g. `/home/USER/rush-media`) so redeploys don't wipe uploads. Copy the existing `backend/media/content/` tree there; DB paths (`content/<user>/<file>`) stay valid. Set `PUBLIC_MEDIA_BASE_URL` to the API's public https URL.
5. **Cron:** hPanel → Advanced → Cron Jobs → every minute: `/usr/bin/node /home/USER/<app-dir>/scripts/run-due-jobs.js >> /home/USER/rush-scheduler.log 2>&1` (use the Node path hPanel shows; the app needs its env vars available to the cron shell, or put them in a `.env` there with `chmod 600`).
6. **Meta:** set `META_REDIRECT_URI` to `https://api.your-domain.com/api/instagram/oauth/callback/` and add it under Valid OAuth Redirect URIs. Keep `META_PUBLISHING_ENABLED=False` until a deliberate live test.
7. Upload limits: videos up to 250 MB are accepted by the app; confirm Hostinger's proxy/PHP-independent request body limit allows it.

## 8. Rollback
Nothing in `backend/` or the DB schema was modified. To roll back: stop the Node app and cron job, start Django (`runserver`/WSGI) and Celery with the old `.env`, rebuild the frontend with the old `VITE_API_BASE_URL`. Rows written by Node are valid Django rows (verified). Don't run both schedulers simultaneously.

## 9. Test results (disposable MySQL 8 container; schema created by Django `migrate`; no production data touched)
`npm test`: **21 passed, 0 failed.** 6 unit tests (dates/timezones, Fernet, PBKDF2, filenames) always run; 15 integration/scheduler tests run with `RUN_INTEGRATION=1` against a disposable DB.
Verified: Django-hashed password login; Django-issued access *and* refresh tokens accepted by Node; Node-written password/Fernet values readable by Django; refresh rotation + logout blacklist; me GET/PATCH; account list hides tokens; content create/list/detail/patch/cancel/retry/dashboard/calendar; DRF-shaped validation errors; media upload + download + signature check; publish-now with publishing disabled ends FAILED with the safety message and retry re-runs; concurrent-claim duplicate prevention; due-job pickup (future/cancelled rows untouched); stuck-PROCESSING recovery.

**Not verified (needs your credentials/environment):** a real Meta OAuth connect, a real publish of a post/reel, live insights, behaviour on Hostinger itself (Node version, cron limits, upload limits), the React UI against the new API in a browser (no frontend code changed; contract exercised by the API tests only), and your real production schema (inspecting it was declined in this session, so I relied on the Django migrations, which are the source of truth).

## 10. Production readiness checklist
- [ ] Production DB dump imported; `DB_*` set; `GET /api/health/` OK, login works
- [ ] `DJANGO_SECRET_KEY` and `FIELD_ENCRYPTION_KEY` identical to the old deployment
- [ ] Celery worker stopped; only the Node scheduler runs
- [ ] Cron job runs every minute (check the log)
- [ ] `MEDIA_ROOT` persistent, old media copied, a media URL opens over https
- [ ] CORS origin and `FRONTEND_URL` match the real frontend domain
- [ ] Meta redirect URI updated; account connect succeeds
- [ ] One deliberate test publish with `META_PUBLISHING_ENABLED=True`, then permalink/status checked
- [ ] Demo seed user password changed (`SEED_PASSWORD`) or user removed
