# Phase 5 — End-to-End Integration & Verification

Pure verification phase. No feature work. No backend services rewritten. No code
changes were required or made — the frontend and backend integrate correctly as
built. All results below were actually executed and observed.

Legend: **PASS** / **FAIL** / **BLOCKED** / **NOT TESTED**.

## 1. Environment and commands used

- OS: Windows (PowerShell). Backend: Python 3.10.7 venv at `backend/.venv`.
  Frontend: Vite 8, React 19, TypeScript, Tailwind 4, Recharts 3.
- A backend was already running (user-started): `uvicorn app.main:app --reload
  --host 127.0.0.1 --port 8000` (PID observed, serving `sentinelx.db`). Left
  untouched.
- Ports at start: 8000 = our backend (python); 5173 = an unrelated `node`
  process (left alone); 5174/5175 free. Vite dev selected 5174.
- Commands:
  - Backend tests: `cd backend ; .\.venv\Scripts\python.exe -m pytest`
  - Frontend build: `cd frontend ; npm run build`
  - Frontend dev: `cd frontend ; npm run dev` (proxies `/api` → `127.0.0.1:8000`)
  - Isolated E2E backend (so the demo DB was never mutated):
    `$env:SIEM_DATABASE_URL='sqlite:///./phase5_e2e.db' ; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001`
    (temp DB deleted afterward).

## 2. Backend regression tests — PASS

`python -m pytest` → **60 passed, 1 warning in ~6.8s**. Warning is a non-fatal
Starlette `TestClient` httpx deprecation. Matches the historical baseline; no
regression. Suites: alerts API (16), config (3), db (2), detection rules (18),
events (19), events persistence (1), health (1).

## 3. Frontend production build — PASS

`npm run build` → `tsc --noEmit` clean, `vite build` → `✓ built`, 613 modules
transformed, `dist/` emitted (`index.html`, CSS 68.8 kB, JS 759.2 kB /
gzip 210 kB). Re-run with an explicit success marker returned `BUILD_RESULT=OK`.
(The non-zero shell exit observed is a PowerShell artifact from Vite's advisory
chunk-size warning on stderr, not a build failure.) Advisory: one JS chunk
> 500 kB — see Known limitations.

## 4. Startup and API connectivity — PASS

- `GET /api/health` (direct, 8000): `{status: ok, database: connected, app:
  SentinelX SIEM Correlation Engine}`.
- Dev server root (`http://localhost:5174/`): HTTP 200, contains `id="root"` and
  loads `/src/main.tsx`.
- Proxied `GET http://localhost:5174/api/health`: returns the backend health
  JSON (`status: ok, database: connected`) → Vite proxy forwards `/api` to
  FastAPI correctly.
- API client uses a single relative base `const API_BASE = '/api'`
  (`src/api/client.ts`). No hardcoded backend host/port anywhere in `src`
  (only an SVG namespace URL and a decorative sample-log string contain
  `http`/`127.0.0.1`).

## 5. Event ingestion — PASS (API) / Event Explorer render NOT TESTED in browser

Executed live against the isolated backend (8001) and covered by `pytest`
(`test_events.py`, 19 tests):
- Valid JSON array of 38 events → `received=38, accepted=38, rejected=0,
  duplicate=0`; `GET /api/events` total = 38.
- Malformed JSON body → HTTP 400.
- Invalid event (bad timestamp) → HTTP 400 (rejected).
- Duplicate `event_uid` → `accepted=0, duplicate=1` (no duplicate row).
- JSONL upload: supported by the implementation (`ingestJsonlFile` in the
  client; `test_ingest_jsonl` passes).
- Event Explorer (`EventsView`) consumes real `listEvents`/`getEvent` responses
  (verified by inspection). Rendering in a browser: NOT TESTED (see §9).

## 6. Detection and alert persistence (five rules) — PASS

Live, isolated DB (8001). Ingested distinct event sequences per rule (unique
source IPs/users/ports, unique uids), confirmed stored, then explicitly called
`POST /api/alerts/evaluate`. Thresholds read from the implementation; none
weakened.

| Rule | Expected | Observed (matched_count / severity) | Result |
|------|----------|-------------------------------------|--------|
| AUTH-001 Brute Force | high | 10 / high | PASS |
| AUTH-002 Password Spraying | high | 5 / high | PASS |
| AUTH-003 Failures→Success | critical | 6 / critical | PASS |
| NET-001 Port Scan | medium | 15 / medium | PASS |
| PRIV-001 Privilege Escalation | high | 2 / high | PASS |

- Evidence resolves: AUTH-003 `evidence_event_ids = [16..21]` → `GET
  /api/alerts/{id}` returns 6 evidence events (5 `authentication_failure` +
  1 `authentication_success`).
- Idempotency: second `evaluate` → `created=0, updated=0, unchanged=5`; alert
  total stayed 5. Alerts are produced only by the engine, never by the test.

## 7. Alert investigation and status persistence — PASS (API/data) / browser refresh NOT TESTED

- List + filters: `severity=critical` → 1, `rule_id=NET-001` → 1,
  `status=investigating` → 1. Pagination params honored.
- Detail + evidence references resolve to the correct stored events.
- `PATCH /api/alerts/{id}` `{status: investigating}` → status updated,
  `matched_count` and evidence preserved; refetch confirms the status persisted
  (would survive a page reload, which re-fetches from the API).
- Re-running `evaluate` after the status change did **not** create a new alert
  and did **not** reset the status (`AUTH-001` stayed `investigating`).
- API errors: client throws with server `detail`; views render error/empty
  states (verified by inspection). Browser-level refresh/visual error states:
  NOT TESTED (see §9).

## 8. Dashboard data accuracy — PASS (with one landing-page honesty finding)

Every dashboard value traces to a real API field (verified by inspection and
cross-checked against the live API):
- Overview KPI cards: `total_events`, `recent_event_count` (`/events/stats`);
  `total_alerts`, `by_severity.critical/high`, `by_status.open`
  (`/alerts/stats`).
- "Event Volume Over Time" area chart: aggregated from real `recentEvents`
  timestamps (hourly buckets). "Alerts by Severity" pie: `alertStats.by_severity`.
  "Incidents by Detection Rule" bar: `alertStats.by_rule`.
- Alerts/Events views and RulesView render real `listAlerts`/`getAlert`,
  `listEvents`/`getEvent`, `listRules` data. Ingestion result tiles are the real
  `IngestSummary`.
- `is_synthetic` is surfaced everywhere via a `ProvenanceBadge`
  (SYNTHETIC vs REAL TELEMETRY). Loading/empty/error states exist in all views
  (RulesView has an implicit-only empty state — minor).
- No fabricated metrics in the dashboard. The only animated/interval code in the
  dashboard is a genuine UTC wall-clock in the TopBar, plus a static
  "DEMO ENVIRONMENT" badge.

**Finding (landing page, not dashboard):** `LiveThreatTicker` and
`RadarScanWidget` display hardcoded illustrative log lines/detections under
"LIVE TELEMETRY STREAM" / "RADAR THREAT SWEEP" framing; they are not wired to the
API. They are decorative marketing visuals, but the "LIVE" wording could be
read as real telemetry. The landing counter ribbon itself uses real API stats
and is explicitly labeled SYNTHETIC. Left unchanged (the brief says preserve the
landing page/animations); recommend relabeling "LIVE" → "SAMPLE/ILLUSTRATIVE"
if strict honesty is desired for the demo.

## 9. Landing page and dashboard browser testing — PARTIAL (interactive assertions NOT TESTED)

- Build compiles all 613 modules (PASS). Dev server serves the SPA (HTTP 200,
  root div + entry) and proxies the API (PASS). `prefers-reduced-motion` is
  respected in CSS (`index.css` media query zeroes animations) and JS
  (`matchMedia` short-circuits in `CyberBackground`, `useCountUp`, `useInView`)
  (code-verified PASS).
- Interactive/visual behaviors — CTA navigation, dashboard tab navigation,
  alert detail open + status update in the UI, ingestion through the UI, actual
  animation rendering, responsive layout at desktop/narrow widths, absence of
  fatal JS errors / stuck spinners — were **NOT TESTED**: no Playwright MCP is
  configured/available in this environment, and the brief says not to install a
  large new testing framework. These must be checked manually (checklist below)
  or with a follow-up Playwright run if approved.

Manual browser checklist (run with backend on 8000 + `npm run dev`):
open `http://localhost:5174/` → landing loads → click CTA → `/dashboard` →
Overview shows real counts → Alerts tab lists alerts, open one, change status →
Events tab lists events → Rules tab shows 5 rules → Ingestion tab: submit a
sample payload → RUN CORRELATION requires a click → resize to mobile width →
toggle OS reduced-motion and confirm animations calm.

## 10. Safety and data integrity — PASS

- No production/third-party systems contacted; all requests are relative `/api`.
- All test events clearly synthetic (`is_synthetic: true`, provenance badge).
- No secrets/credentials in `src` or the built bundle (only a docstring noting
  "No secrets are hardcoded").
- No database reset or destructive migration: `init_db` runs `create_all` plus
  an additive `ALTER TABLE ... ADD COLUMN` only.
- Correlation is NOT auto-triggered on page load: `evaluateAlerts` has exactly
  one call site, inside `AlertsView.handleRunCorrelation`, reached only via the
  RUN CORRELATION button → confirmation modal → "Run Evaluation Now". No
  `useEffect`/interval trigger.
- Repeated evaluation does not create duplicate alerts (verified: `unchanged=5`).
- Unrelated local services untouched (the `node` on 5173 and the user's 8000
  backend left running; no unrelated process killed).
- The real demo DB was not written to in this phase; all mutating E2E ran on an
  isolated temp DB that was deleted afterward.

## 11. Final verification (re-run after checks) — PASS

- `pytest` → 60 passed, 1 warning.
- `npm run build` → `BUILD_RESULT=OK`.
- Demo backend on 8000 still healthy; isolated 8001 stopped; temp DB removed.

## 12. Exact commands to launch the application for the demonstration

Two terminals from the repo root (`f:\siem`):

```powershell
# Terminal 1 — backend (serves /api on port 8000, creates/migrates sentinelx.db)
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# (or: .\.venv\Scripts\Activate.ps1 ; uvicorn app.main:app --reload)
```

```powershell
# Terminal 2 — frontend (Vite dev server; proxies /api to the backend)
cd frontend
npm run dev
```

Then open the URL Vite prints (e.g. `http://localhost:5174/`). The landing page
loads first; the CTA navigates to `/dashboard`. To produce alerts in the demo,
go to the Alerts tab and click **RUN CORRELATION** (the engine is never
triggered automatically).

## Issues found and fixes applied

- No integration defects requiring code changes were found; frontend↔backend
  work together. No code was modified this phase.
- Findings flagged (not changed): landing-page "LIVE" decorative data (§8);
  >500 kB JS chunk (advisory); RulesView implicit empty state; Starlette
  TestClient deprecation warning.

## Known limitations

- Browser-level interaction/animation/responsive testing was not automated
  (no browser tooling available); verify manually with the §9 checklist, or
  authorize a Playwright install for automated coverage.
- Landing page includes illustrative (non-API) "live" visuals; see §8.
- JS bundle 759 kB (210 kB gzip) — acceptable for a local demo; could be
  code-split later.
- Rule thresholds/config are read from the backend implementation; the frontend
  only displays them (via `/api/alerts/rules`).
