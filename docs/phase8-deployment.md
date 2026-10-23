# Phase 8 — Production Deployment & Packaging

Prepares the existing SentinelX SIEM for deployment with the **frontend on
Vercel** and the **backend on Railway**, keeping the existing SQLite database
but making its persistence explicit. This phase is **configuration + local
verification only**. No real deployment was performed (no authenticated Vercel
or Railway access was available in this environment). See §22.

Status labels: **PASS / FAIL / BLOCKED / NOT TESTED / NOT APPLICABLE**.
Repository root: **`F:\siem`** (confirmed: `git rev-parse --show-toplevel` →
`F:/siem`). Date: **2026-10-17**. Course: CIS-117.

---

## 1. Architecture (text diagram)

```
                       Browser (user)
                            │
             HTTPS (static assets + SPA)│
                            ▼
                 ┌───────────────────────┐
                 │        Vercel         │  Root dir: frontend/
                 │  React 19 + Vite SPA  │  Build: npm run build → dist/
                 │  vercel.json rewrite  │  Env: VITE_API_BASE_URL
                 └───────────┬───────────┘
                             │
   HTTPS fetch to VITE_API_BASE_URL + "/api/..."  (cross-origin)
                             │
                             ▼
                 ┌───────────────────────┐
                 │        Railway        │  Root dir: backend/
                 │  FastAPI (uvicorn)    │  Start: uvicorn app.main:app
                 │  CORS allowlist       │         --host 0.0.0.0 --port $PORT
                 │  /api/health check    │  Env: SIEM_ENVIRONMENT,
                 └───────────┬───────────┘       SIEM_DATABASE_URL,
                             │                    SIEM_CORS_ORIGINS
                             ▼
                 ┌───────────────────────┐
                 │ Railway Persistent Vol│  Mount: /data
                 │  /data/sentinelx.db   │  SQLite file (survives redeploys)
                 └───────────────────────┘
```

In development the browser instead loads from the Vite dev server (`:5173`),
which proxies `/api` to the local backend (`:8000`); no cross-origin hop and no
`VITE_API_BASE_URL` are involved. The production and development paths are
selected purely by whether `VITE_API_BASE_URL` is set at build time.

## 2. Repository root & layout (monorepo)

`F:\siem` is a monorepo with **two independent deploy roots**:

```
F:\siem\
  frontend\      ← Vercel "Root Directory"   (Vite SPA)
    vercel.json          (SPA rewrite; added Phase 8)
    .env.example         (VITE_API_BASE_URL;  added Phase 8)
    src\api\client.ts    (API base now env-driven; changed Phase 8)
    src\vite-env.d.ts    (types VITE_API_BASE_URL; changed Phase 8)
  backend\       ← Railway "Root Directory"  (FastAPI)
    railway.json         (builder/start/health; added Phase 8)
    .env.example         (SIEM_* prod guidance; updated Phase 8)
    app\config.py        (CORS parsing + is_production; changed Phase 8)
    app\db\session.py    (sqlite parent-dir creation; changed Phase 8)
    app\db\init_db.py    (production persistence guard; changed Phase 8)
    app\api\health.py    (503 when DB down; changed Phase 8)
    app\main.py          (CORS credentials disabled; changed Phase 8)
  docs\          ← documentation (this file; PROJECT_STATE.md updated)
```

The frontend root is **not** the repository root, and the backend root is
**not** the repository root. Both platforms must be pointed at their
subdirectory.

## 3. Vercel frontend configuration

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment variable | `VITE_API_BASE_URL` = the Railway backend origin (no trailing `/api`) |

`frontend/vercel.json` provides the SPA rewrite so client routes (e.g.
`/dashboard`) resolve on direct load / refresh:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This is safe for static assets: Vercel serves built files from the filesystem
**before** applying rewrites, so hashed assets under `/assets/*` are served
directly and only unmatched routes fall through to `index.html` (confirmed
against Vercel's documented routing order). Because production API calls use an
absolute Railway URL, this rewrite never intercepts API traffic.

## 4. Railway backend configuration

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Builder | Nixpacks (via `railway.json`; detects `requirements.txt`) |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/api/health` |
| Persistent Volume | mount at `/data` |
| Environment variables | `SIEM_ENVIRONMENT`, `SIEM_DATABASE_URL`, `SIEM_CORS_ORIGINS` |

`backend/railway.json`:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Notes:
- The app binds `0.0.0.0` and the Railway-provided `$PORT` — port 8000 is **not**
  hardcoded in production. (Railpack also works if the operator prefers it; the
  start command is the same.)
- The ASGI import path is `app.main:app`, resolved from the `backend/` root.
- Dependencies install from `backend/requirements.txt`; the deploy does not use
  the local Windows `.venv`.

## 5. Exact build & startup commands

**Frontend (Vercel build):** `npm run build` (runs `tsc --noEmit && vite build`
→ `dist/`).

**Backend (Railway start):** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

**Local backend (development):**
`.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`

**Local frontend (development):** `npm run dev`.

## 6. Required environment variables

**Vercel (frontend, build-time, PUBLIC — no secrets):**

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | Yes (prod) | `https://sentinelx-api.up.railway.app` | Backend origin; client appends `/api` |

**Railway (backend, runtime):**

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `SIEM_ENVIRONMENT` | Yes | `production` | Enables the production persistence guard |
| `SIEM_DATABASE_URL` | Yes | `sqlite:////data/sentinelx.db` | Absolute SQLite path on the mounted volume (4 slashes) |
| `SIEM_CORS_ORIGINS` | Yes | `https://sentinelx.vercel.app` | Allowed frontend origin(s); comma-separated or JSON |
| `PORT` | Auto | (injected) | Provided by Railway; consumed by the start command |

No secrets are required by this application. `VITE_*` values are embedded in the
public bundle and must never carry secrets.

## 7. Example environment files

- `frontend/.env.example` — documents `VITE_API_BASE_URL` (added Phase 8).
- `backend/.env.example` — documents `SIEM_ENVIRONMENT`, `SIEM_DATABASE_URL`
  (local vs volume), `SIEM_CORS_ORIGINS` (comma-separated/JSON), and the
  platform `PORT` (updated Phase 8).

Both use placeholders only. Real `.env` files remain git-ignored
(`.gitignore` already excludes `.env` / `.env.*` while allowing `.env.example`).

## 8. CORS configuration

- Origins come from `SIEM_CORS_ORIGINS` (see `app.config.Settings.cors_origins`).
  The value is parsed to accept **either** a comma-separated list (recommended on
  Railway) **or** a JSON array. Empty/unset falls back to the local dev origins.
- `allow_credentials` is **disabled** (Phase 8 change): the API is stateless and
  cookie/token-free, so credentialed CORS is unnecessary, and disabling it avoids
  the browser's prohibition on combining credentials with permissive origins.
- **No wildcard** origin is used for production. Set the exact Vercel domain (and
  a preview domain only if needed).
- CORS is a browser access-control mechanism, **not** authentication or
  authorization. It does not protect the API from non-browser clients.

## 9. SQLite persistence strategy

- The engine reads `SIEM_DATABASE_URL` (SQLAlchemy URL). Local default is the
  relative `sqlite:///./sentinelx.db`. Production must use an **absolute** path on
  a mounted volume: `sqlite:////data/sentinelx.db` (note the four slashes).
- `app/db/session.py` creates the SQLite file's **parent directory** if missing,
  so a volume path works without manual setup. For the local default the parent
  already exists (safe no-op), confirmed by the passing test suite.
- `app/db/init_db.py` adds a **production persistence guard** (`validate_persistence_config`):
  when `SIEM_ENVIRONMENT=production`, the app **refuses to start** on a relative
  or in-memory SQLite path and raises a clear error. There is **no silent
  fallback** to an ephemeral database. (Verified locally: relative path →
  RuntimeError; `sqlite:////data/sentinelx.db` → accepted.)
- Startup initialization is non-destructive: `init_db()` runs
  `create_all` (creates missing tables only) plus additive `ALTER TABLE ADD
  COLUMN` migrations. It never drops or resets tables.
- SQLite connection settings (`check_same_thread=False`) remain appropriate; the
  single shared engine and per-request sessions are unchanged. The database was
  **not** switched to PostgreSQL — no concrete incompatibility requires it for a
  single-instance demo. (See §20 for the single-writer / single-replica caveat.)

## 10. Railway volume mount instructions

1. In the Railway service (backend), add a **Volume**.
2. Set the **Mount Path** to `/data`.
3. Set `SIEM_DATABASE_URL=sqlite:////data/sentinelx.db`.
4. Deploy. On first boot the app creates `/data/sentinelx.db` and its tables.
5. Keep the service at **one replica** (SQLite is single-writer; see §20).

If the volume is absent or unwritable, startup fails loudly (clear error) rather
than running on throwaway storage — this is intentional.

## 11. Health check configuration

- Path: `GET /api/health`. Cheap probe (`SELECT 1`, no table scan).
- Returns **HTTP 200** with `status: "ok"`, `database: "connected"` when the DB
  is reachable; **HTTP 503** with `status: "degraded"`, `database: "unavailable"`
  when it is not (Phase 8 change). This lets Railway treat a DB outage as
  unhealthy instead of routing traffic to a broken backend.
- Response also reports `app`, `version`, `environment`, and a UTC `timestamp`.
  No secrets or configuration values are exposed.
- Verified locally: healthy → 200/connected; simulated DB failure → 503/degraded.

## 12. Frontend root directory

`frontend` (contains `package.json`, `vite.config.ts`, `vercel.json`). Set this
as the Vercel project **Root Directory**.

## 13. Backend root directory

`backend` (contains `requirements.txt`, `railway.json`, the `app` package). Set
this as the Railway service **Root Directory**.

## 14. Production API connectivity

- The frontend API client (`src/api/client.ts`) resolves its base at build time:
  - `VITE_API_BASE_URL` unset → base `/api` (relative; dev proxy).
  - `VITE_API_BASE_URL` set → `<origin>/api`. Trailing slashes are stripped and a
    mistakenly-included trailing `/api` is de-duplicated, so the client never
    emits a doubled `/api`.
  - In a production build with `VITE_API_BASE_URL` missing, the client logs a
    clear console error and does **not** fall back to any localhost URL.
- Verified locally: a production build with
  `VITE_API_BASE_URL=https://sentinelx-api.up.railway.app` embeds that origin in
  the bundle and contains no `:8000` dev reference.
- For requests to succeed in production, `SIEM_CORS_ORIGINS` on Railway must
  include the exact Vercel origin.

## 15. Local development instructions

Unchanged from prior phases; the dev proxy path is preserved.

```powershell
# Terminal 1 — backend
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2 — frontend (do NOT set VITE_API_BASE_URL locally)
cd frontend
npm run dev
```

`vite.config.ts` proxies `/api` → `http://127.0.0.1:8000`. No cross-origin hop
locally.

## 16. Regression test commands

```powershell
cd backend ; .\.venv\Scripts\python.exe -m pytest -q
cd frontend ; npm run build   # confirm with: cmd /c "npm run build && echo BUILD_RESULT=OK"
```

Results this phase (2026-10-17): **backend 68 passed, 1 warning**; **frontend
build OK** (plain and with a production `VITE_API_BASE_URL`). The warning is the
pre-existing Starlette `TestClient` httpx deprecation.

## 17. Production build command

Frontend: `npm run build` (`tsc --noEmit && vite build`). Output: `dist/`.
(The non-zero PowerShell exit sometimes seen is Vite's advisory chunk-size
warning on stderr, not a failure; `cmd /c "npm run build && echo BUILD_RESULT=OK"`
confirms success.)

## 18. Deployment checklist (operator)

**Railway (backend) — do this first so the URL exists for the frontend:**
- [ ] New service from the repo; set Root Directory = `backend`.
- [ ] Add a Volume mounted at `/data`.
- [ ] Set env: `SIEM_ENVIRONMENT=production`,
      `SIEM_DATABASE_URL=sqlite:////data/sentinelx.db`,
      `SIEM_CORS_ORIGINS=<your Vercel URL>` (add after the Vercel domain is known).
- [ ] Confirm start command / health path come from `railway.json`.
- [ ] Deploy; open a public domain; verify `GET /api/health` → 200.

**Vercel (frontend):**
- [ ] New project from the repo; set Root Directory = `frontend`.
- [ ] Framework = Vite; Build = `npm run build`; Output = `dist`.
- [ ] Set env `VITE_API_BASE_URL=<Railway backend URL>` (no trailing `/api`).
- [ ] Deploy; note the production domain.

**Wire-up:**
- [ ] Set `SIEM_CORS_ORIGINS` on Railway to the Vercel domain; redeploy backend.
- [ ] Load the Vercel site; confirm the dashboard reaches the API (no CORS error,
      no offline banner).

## 19. Rollback & recovery

- **Vercel:** each build is immutable; roll back by promoting a previous
  deployment in the dashboard. No data involved.
- **Railway:** redeploy a previous successful deployment. Application code is
  stateless; the database lives on the volume and is unaffected by code
  redeploys.
- **Database backup/restore:** the SQLite file is `/data/sentinelx.db` on the
  volume. Back up by copying that file off the volume (e.g. via a one-off shell
  on the service). There is **no automated backup** configured — document and
  schedule this before relying on it for anything important.
- **Volume safety:** do not delete the volume; detaching or deleting it destroys
  the database. Redeploys do not.

## 20. Known limitations

- **No authentication / authorization** anywhere. The deployed API is publicly
  reachable; CORS restricts browsers only, not direct clients. Not a
  production-hardened multi-user SIEM. (Hardening → Phase 9.)
- **SQLite is single-writer**: run the backend as a **single replica**.
  Horizontal scaling or concurrent writers would require a client/server database
  (e.g. PostgreSQL) — intentionally out of scope.
- **SQLite on a volume** gives local-filesystem semantics on one container; it is
  appropriate for this single-instance demo, not for HA.
- **Synthetic data**: the Attack Simulation Lab produces `is_synthetic` events;
  production should not auto-seed data (and does not).
- **Frontend bundle** ~0.8 MB raw (advisory chunk-size warning only).
- **Carried-over NOT TESTED** (Phase 6/7): mobile hamburger-menu navigation at a
  narrow viewport.

## 21. Exact items NOT yet verified (BLOCKED on platform access)

- **A real Vercel deployment** (build, SPA routing on refresh in situ). NOT TESTED.
- **A real Railway deployment** (Nixpacks build, start command, `$PORT` binding).
  NOT TESTED.
- **Volume persistence across an actual redeploy/restart.** NOT TESTED.
- **A real cross-origin request** from the deployed Vercel frontend to the
  deployed Railway backend (end-to-end CORS). NOT TESTED.
- **Railway health-check behavior in situ** (200/503 handling by the platform).
  NOT TESTED (verified locally only).
- **Nixpacks Python version** actually selected by Railway (local is 3.10.7; the
  code targets 3.10+ and should run on 3.11/3.12). NOT TESTED.

All of the above are verifiable only with authenticated Vercel/Railway access.

## 22. Was a real deployment performed?

**No — NOT DEPLOYED.** This phase produced deployment configuration and verified
it locally (tests, builds, config parsing, health behavior, persistence guard,
production bundle URL embedding). No Vercel or Railway deployment was created or
accessed. A configuration-only result is not a successful deployment. The
operator must complete §18 and then the §21 items can be verified.

## 23. Files changed / added this phase

Changed (backend): `app/config.py`, `app/db/session.py`, `app/db/init_db.py`,
`app/api/health.py`, `app/main.py`, `.env.example`.
Changed (frontend): `src/api/client.ts`, `src/vite-env.d.ts`.
Added: `backend/railway.json`, `frontend/vercel.json`, `frontend/.env.example`,
`docs/phase8-deployment.md`. Updated: `docs/PROJECT_STATE.md`.
No detection logic, rules, thresholds, schemas, or the demo database were
changed. Phase 6 and Phase 7 reports were not modified.
