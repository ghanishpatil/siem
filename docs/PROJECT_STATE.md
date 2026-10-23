# SentinelX SIEM — PROJECT_STATE (cross-agent source of truth)

**Purpose:** a single, accurate reference any agent (Kiro, Antigravity, or
another) can read first to understand what this project *actually* is and what
is *actually* true right now — without re-deriving it or trusting stale chat.

**How to read this file:** facts are split into two kinds.
- **[VERIFIED <date>]** — confirmed by direct source inspection on that date
  (Phase 7 → 2026-10-16; Phase 8 & 9 → 2026-10-17; Phase 10 → 2026-10-18).
- **[OBSERVED]** — results from executed test/build/browser runs (historical but
  real); re-run to re-confirm, since they depend on current data/state.

Last updated: **2026-10-18** (Phase 10 documentation & demo readiness). Course:
CIS-117. Demo target: **19 Oct 2026**.

### Status categories (Phase 10 reconciliation — do not conflate)
- **Implemented & locally tested:** all backend features (70 pytest tests pass);
  ingest→evaluate→alert→evidence→status→stats verified end-to-end via the API on
  an isolated temp DB (2026-10-18); frontend production build passes.
- **Browser tested:** last executed in **Phase 7** (Edge via Playwright, isolated
  stack) — **NOT re-run in Phase 10** (see §12 / §14).
- **Configured for deployment:** Vercel + Railway config present (Phase 8).
- **Actually deployed:** **NO** — never deployed or verified on either platform.
- **Not tested:** mobile hamburger nav; all in-situ platform behavior.

---

## 1. Project identity
SentinelX is a **deterministic SIEM correlation engine** (no AI/LLM detection):
it ingests and normalizes security events, correlates them against five explicit
rules, and raises explainable, deduplicated alerts with an investigation
workflow and a SOC-style dashboard. Detection is rule-based and reproducible.
There are **no** AI-generated verdicts and **no** fabricated/hardcoded metrics.

## 2. Repository root
`F:\siem` **[VERIFIED 2026-10-16]**. Contains `backend/`, `frontend/`, `docs/`,
`samples/`, `README.md`, `.gitignore`. Git: branch `main`, **no commits** — the
entire tree is untracked and must be preserved (do not reset/clean/revert).

## 3. Architecture (high level) [VERIFIED 2026-10-16]
- **Backend:** FastAPI + SQLAlchemy + SQLite. All routes under `/api`. Thin
  routers → `app.normalization` (validation) / `app.detection` (rules) /
  `app.repositories` (persistence). Single shared engine. CORS is env-driven
  (`SIEM_CORS_ORIGINS`) with credentials disabled (Phase 8). Tables auto-created
  on startup (`init_db`).
- **Frontend:** React 19 + Vite + TypeScript + Tailwind + Recharts. Two routes
  (landing, dashboard) via `useRoute`; dashboard sections via a `currentSection`
  switch. Typed API client: relative `/api` in dev (Vite proxy); in production it
  targets `VITE_API_BASE_URL` + `/api` (Phase 8).

## 4. Directory structure (key paths) [VERIFIED 2026-10-16]
```
backend/
  app/
    main.py                 # app wiring; mounts /api routers; init_db on startup
    config.py               # settings (limits, cors, window hours, page sizes)
    api/        health.py events.py alerts.py
    detection/  base.py engine.py service.py  rules/{auth_brute_force,
                auth_password_spray, auth_failure_success, net_port_scan,
                priv_escalation}.py
    normalization/ normalizer.py vocab.py
    models/     event.py alert.py
    repositories/ event_repository.py alert_repository.py
    schemas/    event.py alert.py
    db/         base.py session.py init_db.py
  tests/        test_events.py test_alerts.py test_simulation_scenarios.py ...
  .venv/                     # Python 3.10.7 virtualenv
  sentinelx.db               # demo SQLite DB (DO NOT reset/seed)
frontend/
  src/
    App.tsx                  # dashboard shell + global data + cross-tab nav
    api/client.ts            # typed /api client
    hooks/useRoute.ts
    types/{event,alert,health}.ts
    components/
      landing/  LandingView, LiveThreatTicker, RadarScanWidget
      layout/   Sidebar, TopBar
      views/    OverviewView, AlertsView, EventsView, RulesView,
                IngestionView, SimulationLabView
      common/   Badge (Severity/Status/Provenance), Pagination, EmptyState,
                Modal, StatCard, Icons
    utils/scenarioGenerator.ts
docs/                        # phase docs + this file + browser evidence
```

## 5. API endpoints & contracts [VERIFIED 2026-10-16]
All under `/api`.

**Health**
- `GET /api/health` — liveness + DB connectivity (cheap `SELECT 1`). Returns
  **200** `{status:"ok", database:"connected", ...}` when reachable and **503**
  `{status:"degraded", database:"unavailable", ...}` when not (Phase 8), so
  platform health checks fail correctly on a DB outage. Response includes `app`,
  `version`, `environment`, `timestamp`. Read-only; no secrets exposed.

**Events** (`/api/events`)
- `POST /api/events/ingest` — body may be a single JSON object, a JSON array, or
  a JSONL multipart file upload (`file` field). Returns `IngestSummary`
  {received_count, accepted_count, rejected_count, duplicate_count, accepted[],
  duplicates[], rejected[]}. Status: **201** all accepted · **207** partial ·
  **400** nothing accepted but invalid present / no events / bad JSON · **200**
  all duplicates · **413** too large. De-dupes by `event_uid` (in-batch and vs DB).
- `GET /api/events` — query: `limit` (bounded), `offset`, `event_type`,
  `severity`, `source_ip`. Returns `EventListResponse` {total, limit, offset,
  items[]}. Order: newest first (`timestamp` desc, `id` desc).
- `GET /api/events/stats` — `StatsResponse` {total_events, by_event_type,
  by_severity, recent_event_count, recent_window_hours, **synthetic_count**,
  **real_count**}. (The two provenance fields were added in Phase 7.)
- `GET /api/events/{id}` — `EventResponse` or **404**.

**Alerts** (`/api/alerts`)
- `POST /api/alerts/evaluate` — optional body `EvaluateRequest` {rules: {rule_id:
  {enabled / positive-int threshold overrides}}}. Evaluates persisted events
  against enabled rules and persists alerts. Returns `EvaluateSummary` (observed
  fields include `alerts_created`, `alerts_unchanged`, `detections`). **400** on
  unknown rule; **500** on internal error (transaction rolled back).
- `GET /api/alerts/rules` — `RuleInfo[]` (id, name, severity, effective params).
- `GET /api/alerts/stats` — `AlertStatsResponse` {total_alerts, by_severity,
  by_status, by_rule}.
- `GET /api/alerts` — query: `limit` (default 50, 1..500), `offset`, `severity`,
  `status`, `rule_id`. Returns `AlertListResponse` {total, limit, offset,
  items[]}. Order: most recently detected first.
- `GET /api/alerts/{id}` — `AlertDetailResponse` = `AlertResponse` + `evidence`
  (`EventResponse[]`, resolved from `evidence_event_ids`). **404** if missing.
- `PATCH /api/alerts/{id}` — body `PatchAlertRequest` {status}; validates the
  status enum; returns the updated `AlertResponse`. **404** if missing.

## 6. Database models [VERIFIED 2026-10-16]
Timestamps are stored as **naive UTC** and re-attached to UTC on output.

**`events`** — id (PK), event_uid (unique, indexed), timestamp (indexed),
event_type (indexed), source_ip (indexed), destination_ip, destination_port,
username (indexed), host, source (default "unknown"), severity (indexed),
is_synthetic (bool, default false), raw_event (JSON, verbatim payload),
created_at. Composite index `(timestamp, id)`.

**`alerts`** — id (PK), fingerprint (unique, indexed), rule_id (indexed),
rule_name, severity (indexed), description, status (indexed, default `open`),
source_ip (indexed), username (indexed), host, matched_count,
evidence_event_ids (JSON array of event PKs), explanation (JSON: counts, window,
entities, thresholds), is_synthetic (bool), first_observed, last_observed,
detected_at, created_at, updated_at. Composite index `(detected_at, id)`.

**Alert status values** (investigation lifecycle): `open`, `investigating`,
`acknowledged`, `resolved`, `false_positive`, `closed`.

## 7. Detection rules & thresholds [VERIFIED 2026-10-16]
All thresholds are the rules' `default_params`; `POST /evaluate` can override
enable flags and positive-int thresholds per request.

| ID | Name | Severity | Default thresholds | Trigger (plain English) |
|----|------|----------|--------------------|--------------------------|
| AUTH-001 | Brute Force Authentication | high | threshold **10**, window **60s** | ≥10 auth failures from one source IP within 60s |
| AUTH-002 | Password Spraying | high | distinct_accounts **5**, window **300s** | failures against ≥5 distinct accounts from one source IP within 300s |
| AUTH-003 | Failed Logins Followed by Success | critical | min_failures **5**, window **300s** | ≥5 failures then a success for the same (IP, account) within 300s |
| NET-001 | Potential Port Scan | medium | distinct_ports **15**, window **60s** | ≥15 distinct destination ports from one source IP within 60s |
| PRIV-001 | Suspicious Privilege Escalation | high | window **300s** | a privilege-escalation event followed by ≥1 sensitive action (file access / process creation) by the same account within 300s |

Each detection carries an `explanation` (reason, threshold, window, counts,
entities) persisted on the alert.

## 8. Deduplication behavior [VERIFIED 2026-10-16]
- **Events:** de-duplicated by `event_uid` (both within a batch and against the
  DB); duplicates are reported, not inserted.
- **Alerts:** a stable `fingerprint` (rule + correlation entities) makes
  evaluation **idempotent** — re-evaluating unchanged evidence yields
  `alerts_created=0` and leaves existing alerts (and their status) unchanged.
  A genuinely new entity (e.g. a new source IP for AUTH-001) creates a new alert.
  **[OBSERVED, Phase 6]** confirmed live: repeat eval → all unchanged; new IP →
  one new alert.

## 9. Frontend routes & components [VERIFIED 2026-10-16]
- **Routes:** `landing` (public page) and `dashboard` (SOC console), via
  `useRoute`.
- **Dashboard sections:** `overview`, `alerts`, `events`, `rules`, `ingestion`,
  `simulation`.
- **Cross-tab navigation (Phase 7):** evidence row "Open in Events →" → Event
  Explorer; event "Referenced by Alerts" "Open alert →" → Alerts; Overview
  cards deep-link to a selected alert/event. Wired in `App.tsx` via
  `targetAlertId` / `targetEventId`.
- **Investigation (Phase 7, AlertsView):** chronological evidence timeline,
  backend-confirmed status changes with inline errors, JSON export of alert +
  evidence, enriched evidence rows with raw-JSON inspect.
- **Analytics (Phase 7, OverviewView):** "Alerts by Investigation Status" (from
  `/api/alerts/stats`) and "Events by Provenance" synthetic-vs-real (from
  `/api/events/stats`), each with empty/unavailable fallbacks.
- **Landing note:** `LiveThreatTicker` / `RadarScanWidget` are explicitly
  labeled **SAMPLE / ILLUSTRATIVE** (not real-time telemetry).

## 10. Attack Simulation Lab workflow [VERIFIED 2026-10-16 (source) / OBSERVED (live)]
`SimulationLabView` + `scenarioGenerator.ts`. Five scenario cards
(AUTH-001/002/003, NET-001, PRIV-001). Explicit, separate steps:
1. **Generate Scenario** — client-side only; produces synthetic events
   (`is_synthetic: true`, `source: "simulation-lab"`, RFC 5737 TEST-NET-2 IPs,
   per-run isolation). No API call.
2. **Ingest Events to API** — `POST /api/events/ingest`; shows real
   accepted/duplicate/rejected counts.
3. **RUN CORRELATION** — `POST /api/alerts/evaluate` then `GET /api/alerts`;
   verdict lifecycle GENERATED → INGESTED → EVALUATED → **DETECTED / NOT
   DETECTED / FAILED**. DETECTED links to the real alert detail + evidence.
Correlation never auto-runs after ingestion. A backend/network failure routes to
a distinct **FAILED** state ("Correlation Failed"), not a false "no detection"
(the Phase 6 `evaluation_failed` fix — **[VERIFIED 2026-10-16]** still present).

## 11. Test & build commands [VERIFIED 2026-10-16]
```powershell
# Backend unit/integration tests
cd backend ; .\.venv\Scripts\python.exe -m pytest -q

# Frontend typecheck + production build
cd frontend ; npm run build
# PowerShell may show a non-zero exit from Vite's chunk-size stderr warning even
# on success; to confirm explicitly:
cmd /c "npm run build && echo BUILD_RESULT=OK"
```

## 12. Latest observed results
**[OBSERVED 2026-10-18, Phase 10]**
- **Backend tests:** `70 passed, 1 warning` (re-run; unchanged — Phase 10 added
  no code). Warning = Starlette `TestClient` httpx deprecation (non-fatal).
- **Frontend build:** `BUILD_RESULT=OK`.
- **API end-to-end (isolated temp DB):** ingest 10 events → 201; evaluate → 1
  detection (AUTH-001, created); `GET /api/alerts/{id}` returns 10 evidence rows;
  `PATCH` status → `investigating` (200); invalid status → 422; missing timestamp
  → 400; stats accurate. Demo DB untouched.
- **Browser:** **NOT re-tested in Phase 10** (last executed in Phase 7). Phase 10
  is documentation-only; no frontend app code changed.

**[OBSERVED 2026-10-17, Phase 9]**
- **Backend tests:** `70 passed, 1 warning` (68 prior + 2 new security-header
  tests). Warning = Starlette `TestClient` httpx deprecation (non-fatal).
- **Frontend build:** `BUILD_RESULT=OK`.
- **Security checks (local):** production disables `/docs` & `/openapi.json`
  (→404); security headers present on 200 and 404; `npm audit` → 0 vulns.
  No real deployment performed (see `docs/phase9-security-hardening.md`).

**[OBSERVED 2026-10-17, Phase 8]**
- **Backend tests:** `68 passed, 1 warning` (unchanged after deployment-config
  edits). Warning = Starlette `TestClient` httpx deprecation (non-fatal).
- **Frontend build:** `BUILD_RESULT=OK`, plain and with a production
  `VITE_API_BASE_URL`; the configured host is embedded in the bundle and no
  `:8000` dev reference remains.
- **Deployment-behavior checks (local):** health → 200/connected, simulated DB
  failure → 503/degraded; production persistence guard rejects a relative SQLite
  path and accepts `sqlite:////data/sentinelx.db`; CORS parses comma-separated
  and JSON forms. **No real Vercel/Railway deployment** was performed (see
  `docs/phase8-deployment.md` §21–§22).

**[OBSERVED 2026-10-16, Phase 7]**
- **Backend tests:** `68 passed, 1 warning` (67 prior + the new
  `test_stats_includes_provenance_counts`).
- **Frontend build:** `BUILD_RESULT=OK` (`tsc --noEmit` clean + `vite build`).
- **Browser acceptance (Phase 7, system Edge via cached Playwright, isolated
  backend :8001 + temp DB, UI :5190):** analytics render PASS · timeline renders
  PASS · timeline chronological despite out-of-order ingest PASS · JSON export
  (alert + evidence) PASS · status change persists after refresh PASS
  (`patchStatus:200, badgeResolvedVisible:true, persistedResolved:true`) ·
  event→alert navigation PASS · 0 fatal JS errors. Evidence:
  `docs/phase7-browser-evidence/01-analytics.png, 02-timeline.png, 03-status.png`.
- **Prior (Phase 6):** `67 passed, 1 warning`; browser acceptance 21 PASS / 0
  FAIL / 2 NOT TESTED (see `docs/phase6-integration-verification.md`).

These were run against **isolated** temporary databases / stacks; the demo DB was
not written to.

## 13. Known limitations
- **No authentication** anywhere in the stack. Fine for a local, single-user
  demo; **not** hardened for multi-user or network exposure.
- **Event → referencing-alert lookup** scans only the 500 most-recent alerts (no
  dedicated endpoint); the UI discloses "scanned N of M most recent" when more
  exist.
- **Investigation export is JSON only** (no CSV/PDF).
- **Frontend bundle** ~0.8 MB raw — advisory chunk-size warning only.
- Generated simulation payloads nest a `raw_event`/`simulation_meta`; the backend
  stores the whole object as `raw_event` (harmless redundancy).
- **Deployment (Phase 8):** SQLite is single-writer → run the backend as a
  **single replica**; persistence requires a Railway volume at `/data` with
  `SIEM_DATABASE_URL=sqlite:////data/sentinelx.db`. No automated DB backup is
  configured. CORS restricts browsers only, not direct API clients.
- **Security (Phase 9):** the API has **no authentication/authorization** — an
  unrestricted public deployment lets anyone read all data and perform writes.
  Not appropriate for public exposure without auth or platform access control;
  suitable only as an access-restricted controlled demo. No storage quota/
  retention. Security response headers were added (backend + Vercel) and docs are
  disabled in production; a frontend CSP is not yet added. See
  `docs/phase9-security-hardening.md`.

## 14. Outstanding manual checks
- **Mobile hamburger-menu navigation** to a specific view at a narrow viewport —
  **NOT TESTED** (carried over from Phase 6 §14/§18; page renders and is
  error-free at 390px, but the automated menu-open was inconclusive). Verify
  manually.
- *(Resolved)* Alert status change persisting across a full browser refresh —
  previously NOT TESTED in Phase 6; **now VERIFIED in-browser in Phase 7** (see
  §12). No longer outstanding.

## 15. Completed phases (history)
- **Phase 0** — environment inspection + scaffolding (FastAPI backend venv, Vite
  frontend); `/health` verified.
- **Phase 1** — foundation verification (tests/build/proxy; cleaned an orphaned
  uvicorn holding port 8000).
- **Phase 2** — event ingestion / normalization / persistence (model, schemas,
  normalizer, repo, API, JSONL upload).
- **Phase 3** — correlation engine + the five rules + persistent, deduplicated
  alerts (added `destination_port` via an additive migration).
- **Phase 5** — end-to-end verification; the React dashboard (built by
  user/Antigravity) was discovered and verified; landing "live telemetry"
  fabrication flagged.
- **Phase 6** — verification of Antigravity's Attack Simulation Lab; fixed the
  `evaluation_failed` defect; landing relabeled SAMPLE/ILLUSTRATIVE; browser
  acceptance executed. See `docs/phase6-integration-verification.md`.
- **Phase 7** — incident investigation & security analytics. See
  `docs/phase7-investigation-analytics.md`.
- **Phase 8** — production deployment readiness & packaging (Vercel + Railway):
  env-driven API base, env-driven CORS (credentials off), SQLite persistence via
  a Railway volume with a production guard, health 503-on-DB-down, `vercel.json`
  + `railway.json` + `.env.example` files. **Configuration + local verification
  only — NOT DEPLOYED.** See `docs/phase8-deployment.md`.
- **Phase 9** — security hardening & final QA: threat model; reviewed input
  validation, API exposure, CORS, DB integrity, frontend rendering; `npm audit`
  (0 vulns); added security response headers (backend + Vercel), production docs
  gating, and a production wildcard-CORS warning. Primary finding: **no
  authentication** → public exposure not appropriate without access control.
  See `docs/phase9-security-hardening.md`.
- **Phase 10** — documentation & demonstration preparation (no new features).
  Rewrote the outdated root `README.md` (it had wrongly claimed "Phases 0–3" and
  "frontend not implemented yet"); added `docs/api-reference.md` (verified
  examples), `docs/technical-walkthrough.md`, `docs/demo-runbook.md`,
  `docs/demo-presentation.md`, and `docs/phase10-demo-readiness.md`; re-verified
  tests/build/API. See `docs/phase10-demo-readiness.md`.
- *Note:* there was no separate "Phase 4" implementation step by this agent — the
  frontend already existed when Phase 5 began; it was verified rather than
  re-built.

## 16. Phase status
- **Phase 7** — closed. All features implemented against existing APIs plus one
  justified stats extension (`synthetic_count`/`real_count`); backend 68 passed;
  build OK; browser acceptance all PASS.
- **Phase 8** — deployment readiness **ready to close as configuration +
  local verification**. Backend 68 passed; builds OK; health/guard/CORS verified
  locally. **NOT DEPLOYED** — no Vercel/Railway access in this environment; the
  operator must perform the deployment (`docs/phase8-deployment.md` §18) and then
  the §21 in-situ items can be verified.
- **Phase 9** — security hardening & final QA **ready to close**. Backend 70
  passed; build OK; minimal hardening added; threat model + limitations
  documented. Primary limitation (no auth) is documented, not code-fixed;
  restricted-access deployment recommended. Still **NOT DEPLOYED**.
- **Phase 10** — documentation & demo readiness **ready to close**. README
  corrected; demo/runbook/walkthrough/API-reference/presentation docs created;
  tests (70) + build + API end-to-end re-verified on 2026-10-18. Verdict:
  **READY FOR CONTROLLED DEMO** (local, access-restricted). Still **NOT
  DEPLOYED**; browser suite not re-run this phase.

## 17. Remaining tasks
- **Operator deployment** per `docs/phase8-deployment.md` §18 (Railway backend +
  volume, Vercel frontend, CORS wire-up), then verify §21 NOT TESTED items.
- Manual: mobile hamburger navigation check (§14).
- Optional (non-blocking): dedicated `GET /api/events/{id}/alerts` endpoint to
  remove the 500-alert scan bound; CSV/PDF export; frontend code-splitting;
  automated SQLite backup.
- **Security follow-ups (from Phase 9):** add authentication/authorization (or
  platform access control) before any public exposure; add storage quota/
  retention; add a frontend CSP once the backend origin is known; add `pip-audit`
  to CI. See `docs/phase9-security-hardening.md` §7/§13.
- Optional: re-run the browser acceptance suite for a fresh Phase 10 UI
  confirmation (last executed in Phase 7).
- **Phase 11 has not been started** (intentionally out of scope for now).

## 18. Startup commands
Two terminals from `F:\siem`:
```powershell
# Terminal 1 — backend (serves /api on 8000; creates/migrates sentinelx.db)
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
```powershell
# Terminal 2 — frontend (Vite dev server; proxies /api to the backend)
cd frontend
npm run dev
```
Open the URL Vite prints (5173 if free, else the next port).

## 19. Database safety rules
- The demo database is the single SQLite file `backend/sentinelx.db`. **Do not
  reset, drop, or seed it.** It is created/migrated automatically on backend
  startup (`init_db` creates missing tables; schema changes to date have been
  additive).
- **Automated backend tests** use isolated temporary databases (never the demo
  DB).
- **Browser E2E** in Phases 6–7 used a throwaway backend on `:8001` with a
  temporary DB and a temp Vite server on `:5190`; artifacts were deleted
  afterward. The demo DB was never written to during verification.
- **Production (Railway)** uses a **separate** SQLite file on a persistent volume
  (`/data/sentinelx.db`), never the local demo DB. The local
  `backend/sentinelx.db` is not copied to production and no data is auto-seeded.
  Phase 8 edits did not reset or mutate the demo DB (confirmed present and
  unchanged; only read via `SELECT 1`).

## 20. Verified-vs-historical summary
- **[VERIFIED 2026-10-16] by source inspection:** repo root; architecture;
  directory layout; every API route and contract; DB models and indexes; the five
  rules and their thresholds/severities; dedup design; frontend routes/components
  and Phase 7 wiring; Simulation Lab workflow; the `evaluation_failed` fix;
  test/build/startup commands.
- **[VERIFIED 2026-10-17, Phase 8] by source inspection + local execution:**
  env-driven API base (`VITE_API_BASE_URL`) and CORS (`SIEM_CORS_ORIGINS`,
  credentials off); SQLite parent-dir creation; production persistence guard;
  health 200/503 behavior; `vercel.json` SPA rewrite; `railway.json` start/health;
  `.env.example` files. See `docs/phase8-deployment.md`.
- **[VERIFIED 2026-10-17, Phase 9] by source inspection + local execution:**
  strong input validation (IP/port/timestamp, controlled vocab); `extra="forbid"`
  + enum/positive-int schemas; parameterized ORM; no XSS sinks; generic errors;
  security response headers (backend + Vercel); production docs gating; prod
  wildcard-CORS warning; `npm audit` 0 vulns. **No authentication** (documented).
  See `docs/phase9-security-hardening.md`.
- **[VERIFIED 2026-10-18, Phase 10] by source inspection + local execution:** the
  documentation set (README, API reference, technical walkthrough, demo runbook,
  presentation) matches the real routes, schemas, rule thresholds, UI labels, and
  startup commands; API examples captured from the running app on an isolated
  temp DB. README's prior stale claims corrected. See
  `docs/phase10-demo-readiness.md`.
- **[OBSERVED] from executed runs (re-run to re-confirm):** backend `70 passed`
  (Phase 9; was 68 at Phase 8); frontend `BUILD_RESULT=OK` (incl. production-URL
  build); Phase 7 browser acceptance all PASS; Phase 6 live detection/dedup
  results and `67 passed`. Depends on current data/state and environment
  (Python 3.10.7 venv; system Edge).
- **NOT verified (BLOCKED on platform access):** any real Vercel/Railway
  deployment and in-situ cross-origin/persistence/health behavior
  (`docs/phase8-deployment.md` §21). The project is **NOT DEPLOYED**.

## 21. Deployment quick reference (Phase 8) — NOT DEPLOYED
- **Frontend (Vercel):** Root `frontend`; build `npm run build`; output `dist`;
  env `VITE_API_BASE_URL=<Railway URL>` (no trailing `/api`); `vercel.json` SPA
  rewrite.
- **Backend (Railway):** Root `backend`; start
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT`; health `/api/health`;
  volume at `/data`; env `SIEM_ENVIRONMENT=production`,
  `SIEM_DATABASE_URL=sqlite:////data/sentinelx.db`,
  `SIEM_CORS_ORIGINS=<Vercel origin>`.
- Full instructions, checklist, rollback, and unverified items:
  `docs/phase8-deployment.md`.
