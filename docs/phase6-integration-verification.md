# Phase 6 — Integration Verification, Testing & Reconciliation

Independent reconstruction and verification of the Attack Simulation Lab that
Antigravity implemented. Worked from the actual source, tests, and live API —
not from prior assumptions. Status labels: **PASS / FAIL / BLOCKED / NOT TESTED
/ NOT APPLICABLE**.

## 1. Actual repository root
`F:\siem` (confirmed). Contains `backend/`, `frontend/`, `docs/`, `samples/`,
`README.md`, `.gitignore`, and an untracked `.playwright-mcp/` artifact
directory. Git has **no commits** (branch `main`, everything untracked) — the
working tree was preserved; nothing was reset, cleaned, or reverted.

## 2. Current project architecture
- **Backend** (`backend/app`): FastAPI + SQLAlchemy + SQLite. Routes: health,
  events (ingest/list/get/stats), alerts (evaluate/list/get/patch/stats/rules).
  Deterministic detection engine with 5 rules; alert fingerprint dedup; additive
  `init_db` migration. Single shared engine.
- **Frontend** (`frontend/src`): React 19 + Vite + TS + Tailwind + Recharts.
  Landing page + dashboard; navigation via `useRoute` (landing/dashboard) and a
  `currentSection` switch (overview, alerts, events, rules, ingestion,
  **simulation**). Typed `/api` client; relative `/api` only.

## 3. Files inspected
Backend: `app/main.py`, `api/alerts.py`, `api/events.py`, `detection/service.py`,
`detection/engine.py`, `detection/rules/*`, `detection/base.py`,
`repositories/alert_repository.py`, `repositories/event_repository.py`,
`normalization/normalizer.py`, `normalization/vocab.py`, `models/*`,
`db/init_db.py`, `tests/test_simulation_scenarios.py`, full `tests/` suite.
Frontend: `utils/scenarioGenerator.ts`, `components/views/SimulationLabView.tsx`,
`api/client.ts`, `App.tsx`, `components/layout/Sidebar.tsx`,
`components/landing/LiveThreatTicker.tsx`, `RadarScanWidget.tsx`. Plus
`docs/phase5-e2e-verification.md`.

## 4. Files modified (and why)
- `frontend/src/components/views/SimulationLabView.tsx` — **one minimal fix**:
  added an `evaluation_failed` lifecycle state. Previously, a failed
  `POST /api/alerts/evaluate` (or the follow-up `GET /api/alerts`) was caught and
  the UI was set to `not_detected`, which rendered "Correlation Completed — No
  Detection Alert Found" and never showed the error — i.e. an API failure was
  mislabeled as a completed no-detection. The fix routes evaluation errors to a
  distinct FAILED verdict that surfaces the error and offers Retry, satisfying
  the required GENERATED/INGESTED/EVALUATED/DETECTED/NOT DETECTED/**FAILED**
  state separation. No other frontend or backend code changed.
- `docs/phase6-integration-verification.md` — this report (new).

No backend code was modified. No detection thresholds were changed. The demo
database was not written to or reset.

## 5. Phase 6 frontend implementation status — COMPLETE (with the one fix above)
PASS by source inspection:
- Five scenario cards (AUTH-001/002/003, NET-001, PRIV-001), each naming its rule
  and expected pattern/threshold (`SimulationLabView` + `SCENARIO_DEFINITIONS`).
- Safety banner: "SIMULATION MODE — Synthetic events only… `is_synthetic: true`…
  RFC 5737 test-net IP ranges," plus a CONTROLLED SANDBOX badge.
- Generation, ingestion, and correlation are **separate explicit actions**
  (Generate Scenario → Ingest Events to API → RUN CORRELATION).
- Ingestion counts come from the real `IngestSummary`; detection comes from the
  real `evaluateAlerts` + `listAlerts`; DETECTED links to the real alert detail
  via `onNavigateToAlert`; evidence comes from `GET /api/alerts/{id}`.
- Synthetic provenance visible (event inspector shows `is_synthetic: true` and
  the full payload). Integrated into existing nav (Sidebar "Simulation Lab");
  existing routes preserved.
- No fake live telemetry added in the Lab. Landing `LiveThreatTicker` and
  `RadarScanWidget` were **already relabeled** by Antigravity to
  "SAMPLE TELEMETRY / ILLUSTRATIVE STREAM" and "RADAR THREAT SWEEP (SAMPLE) /
  ILLUSTRATIVE DATA" — the Phase 5 finding is resolved; no change needed.

## 6. Event-generation verification — PASS (source inspection)
`scenarioGenerator.ts` produces payloads that conform to the ingestion schema and
the real detection vocabulary:
- Canonical event types only: `authentication_failure`, `authentication_success`,
  `network_connection`, `privilege_escalation`, `process_creation`,
  `file_access`.
- `is_synthetic: true`, `source: "simulation-lab"` on every event.
- Unique `event_uid`s incorporating a per-run id; run-isolated source IP in RFC
  5737 TEST-NET-2 (`198.51.100.0/24`) so runs don't collide with each other or
  real data.
- Sequences satisfy the real windows/thresholds: AUTH-001 10 failures/≈20s;
  AUTH-002 6 distinct usernames; AUTH-003 5 failures then 1 success same
  IP+user; NET-001 16 distinct ports; PRIV-001 privilege_escalation → process →
  file for the same user. Extra fields (`simulation_meta`, nested `raw_event`)
  are tolerated by the backend (`extra` allowed; whole payload stored as
  `raw_event`) — accepted, not rejected.

## 7. Ingestion results (all five scenarios) — PASS (live, isolated DB 8001)
Submitting the frontend-shaped payloads to `POST /api/events/ingest`:
`received=41, accepted=41, rejected=0, duplicate=0`. Alerts before evaluation:
`0` (ingestion never auto-creates alerts). Negative/edge behavior
(from `tests/test_simulation_scenarios.py` + Phase-5 live checks): malformed
payload → rejected (accepted=0), invalid JSON → 400, duplicate `event_uid` →
`duplicate_count=1, accepted_count=0`.

## 8. Detection results (all five rules) — PASS
Live via the real API (explicit `POST /api/alerts/evaluate`, isolated DB) and by
`tests/test_simulation_scenarios.py` (7/7 passing):

| Rule | Severity (observed) | matched_count | Result |
|------|---------------------|---------------|--------|
| AUTH-001 | high | 10 | PASS |
| AUTH-002 | high | 6 | PASS |
| AUTH-003 | critical | 6 | PASS |
| NET-001 | medium | 16 | PASS |
| PRIV-001 | high | 3 | PASS |

`evaluate` returned `alerts_created=5, detections=5` from a clean DB; each alert's
entity matched its scenario (unique source IP, or username for PRIV-001).

## 9. Evidence verification — PASS
`GET /api/alerts/{id}` for the AUTH-003 alert returned `evidence_event_ids =
[17,18,19,20,21,22]` resolving to 6 events: 5 `authentication_failure` + 1
`authentication_success`. The Lab's DETECTED match requires the alert's rule_id
to equal the scenario AND either an evidence event id from the current run or a
matching correlation entity (source_ip/username), so detection is tied to the
current run — not merely to a pre-existing rule-id.

## 10. Correlation control verification — PASS (source inspection + live)
`evaluateAlerts` has exactly one call site: `handleRunCorrelation`, wired only to
the RUN CORRELATION button (shown after ingestion). No `useEffect`, interval, or
post-ingestion auto-call. Confirmed live that ingestion alone produced 0 alerts.
Generation/ingestion/correlation are distinct user actions. Button shows a
loading ("evaluating") state; errors now route to the FAILED state (fix §4).

## 11. Repeatability & deduplication — PASS (live)
- Re-running `evaluate` on unchanged evidence: `alerts_created=0,
  alerts_unchanged=5`, total unchanged — idempotent, no duplicate alerts, status
  not reset.
- A second AUTH-001 run with a new isolated IP created a **new** alert
  (`alerts_created=1`, AUTH-001 total → 2) while leaving the others unchanged —
  per-run isolation works; a prior alert is not falsely reused.

## 12. Backend test results — PASS
`cd backend ; .\.venv\Scripts\python.exe -m pytest -q` → **67 passed, 1 warning**
(was 60; Antigravity added `tests/test_simulation_scenarios.py` = 7 tests). The
single warning is the Starlette `TestClient` httpx deprecation (non-fatal).

## 13. Frontend production build — PASS
`cd frontend ; npm run build` → `tsc --noEmit` clean + `vite build` → `✓ built`,
`BUILD_RESULT=OK` (verified before and after the fix). The non-zero shell exit is
a PowerShell artifact from Vite's advisory chunk-size warning on stderr, not a
build failure.

## 14. Browser tests actually executed — EXECUTED (system Edge via Playwright)

**Tool:** Playwright (cached module v1.64.1 from the npm-cache `_npx` store)
driving the **system Microsoft Edge** via `channel: 'msedge'` (headless) — no
new framework or browser was downloaded/installed. The project's bundled
Playwright browser builds (1228/1243) mismatched the cached module's expected
build, so the system Edge channel was used instead.

**Isolation:** the browser drove a dedicated Vite dev server on `:5190`
(launched with a throwaway `vite.e2e.config.ts`, since deleted) whose `/api`
proxy pointed at an **isolated backend on `:8001` with a temporary database**.
The demo database (`:8000` / `sentinelx.db`) was never written to; the temp DB
was deleted afterward. Viewport 1366×900 (desktop) and 390×844 (mobile).

**Executed results:**

| Browser check | Result | Evidence |
|---|---|---|
| Landing page loads, no fatal JS errors | PASS | title "SentinelX SIEM \| SOC Command Center"; 01-landing.png |
| SAMPLE TELEMETRY / ILLUSTRATIVE labels visible | PASS | 3 labels found |
| Primary CTA navigates to dashboard | PASS | clicked "Open Security Console" → dashboard |
| Dashboard not blank (sidebar + nav) | PASS | — |
| Overview / Alerts / Event Explorer / Detection Rules / Log Ingestion / Simulation Lab load | PASS (6/6) | per-view marker text rendered |
| Switching views does NOT trigger correlation | PASS | 0 `POST /api/alerts/evaluate` during navigation |
| 5 scenario cards + safety notice render | PASS | 5 "Generate Scenario" buttons + "SIMULATION MODE" |
| Generate Scenario is client-side only (no API calls) | PASS | 0 ingest/evaluate during generation |
| Ingestion reflects real API response | PASS | `POST /api/events/ingest` → HTTP 201 shown |
| Correlation NOT auto-run after ingestion | PASS | evaluate not called after ingest |
| RUN CORRELATION → backend verdict DETECTED | PASS | "INCIDENT DETECTED & VERIFIED BY BACKEND"; 02-detected.png |
| Correlation runs only on explicit click | PASS | evaluate POST delta = 1 after click |
| Matching detection links to real alert detail + evidence | PASS | "Open Incident Details" → detail/evidence; 03-alert-evidence.png |
| Failed correlation shows FAILED, not NOT DETECTED | PASS | evaluate aborted (route) → "Correlation Failed"; 04-correlation-failed.png |
| Failed ingestion does not show success | PASS | ingest aborted (route) → "Ingestion Failed" |
| No fatal JS errors across the whole run | PASS | 0 pageerrors |
| Narrow viewport (390px) + prefers-reduced-motion renders, no errors | PASS | content renders, 0 pageerrors; 05-mobile-reduced-motion.png |
| Mobile hamburger navigation to a specific view | NOT TESTED | automated menu-open was inconclusive; verify manually |
| Alert status change persists after browser refresh | NOT TESTED | API-level persistence verified in Phase 6 §7; not re-driven in-browser |

Evidence screenshots: `docs/phase6-browser-evidence/01..05*.png`. The FAILED-vs-
NOT-DETECTED check used Playwright request interception (`route.abort`) in the
test only — no production code fakes network errors or detection results.

**Third-party corroboration:** Antigravity's own Playwright MCP session left
artifacts in `.playwright-mcp/` (page accessibility snapshots +
`simulation_lab_verified.png`) showing a NET-001 run reaching DETECTED with real
alert #7. Those were inspected (not re-executed) and predate the
`evaluation_failed` fix; they corroborate the success path.

## 15. Known limitations
- The Lab associates an alert with a run via evidence-id or entity (source_ip /
  username) match against `listAlerts({limit: 50})`. With >50 alerts the matching
  alert could fall outside the first page; it is newest-first so the just-created
  alert will normally appear. Minor; acceptable for a local demo.
- PRIV-001 alerts have `source_ip = null` (the rule correlates by username); the
  Lab's entity match correctly falls back to username. Verified.
- Generated payloads include a nested `raw_event` and `simulation_meta`; the
  backend stores the entire submitted object as `raw_event` (slight nesting
  redundancy) — harmless, not a defect.
- Browser-only behaviors remain NOT TESTED by this agent (see §14).
- JS bundle ~760 kB (gzip ~210 kB) — advisory only.

## 16. Exact commands to launch the application
Two terminals from `F:\siem`:
```powershell
# Terminal 1 — backend (serves /api on 8000; creates/migrates sentinelx.db)
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
```powershell
# Terminal 2 — frontend (Vite; proxies /api to the backend)
cd frontend
npm run dev
```
Open the URL Vite prints (5173 if free, else the next port). Landing → CTA →
`/dashboard` → "Simulation Lab".

## 17. Manual demo checklist (Attack Simulation Lab)
1. Open dashboard → Simulation Lab. Confirm the amber SIMULATION MODE safety
   banner and five scenario cards.
2. Click **Generate Scenario** on AUTH-001 → stepper shows "1. Generated / 10
   Events"; event table lists 10 synthetic rows (inspect one → `is_synthetic:
   true`).
3. Click **Ingest Events to API** → right panel shows real accepted/duplicate/
   rejected counts + persisted event IDs; stepper "2. Ingested".
4. Confirm **no** alert appears yet (go to Alerts tab and back) — correlation did
   not auto-run.
5. Click **RUN CORRELATION** → stepper "3. Evaluated"; verdict "4. DETECTED" with
   ALERT #; click **Open Incident Details** → real alert + evidence events.
6. Repeat for AUTH-002, AUTH-003 (critical), NET-001 (medium), PRIV-001.
7. Run the same scenario again → a new run id/IP → a new alert (no false reuse).
8. (Optional) Temporarily stop the backend, click RUN CORRELATION → verdict
   should show **FAILED** with an error (not "no detection").
9. Toggle OS reduced-motion → landing/dashboard animations calm.
10. Resize to a narrow viewport → layout remains usable.

## 18. Remaining work before Phase 7
Browser acceptance has now been executed (§14). Only two minor browser checks
remain NOT TESTED and should be verified manually (or with a dedicated mobile
test):
- Mobile hamburger-menu navigation to a specific view at narrow viewport
  (the page renders and is error-free at 390px; only the automated menu-open was
  inconclusive).
- Alert investigation status change persisting across a full browser refresh
  (persistence is proven at the API layer in §7; not re-driven through the UI).

Optional/nice-to-have (not blockers):
- Surface the ingestion `partial`/`failed` distinction and `simulation_meta`/run
  id in the Event Explorer to tie events to a run more explicitly.
- Code-split the frontend bundle to clear the chunk-size advisory.

No blockers were found in the backend↔frontend integration. With the browser
acceptance pass complete, Phase 6 is functionally complete.
---

## Phase 7 preservation note — appended 2026-10-16 (content above unchanged)

This note was **appended** during Phase 7. Nothing in sections 1–18 above was
edited, shortened, or re-scored. No Phase 6 result was promoted from
**NOT TESTED** to **PASS**. The two browser checks that section 14/18 recorded as
NOT TESTED are addressed honestly below.

**Phase 6 `evaluation_failed` fix — still present (re-verified 2026-10-16 by source
inspection of `frontend/src/components/views/SimulationLabView.tsx`):**
- `evaluation_failed` is a member of the `SimulationState` union.
- The `catch` branch of the correlation handler sets `state: 'evaluation_failed'`
  and stores `evalError` (a backend/network failure is **not** turned into a
  no-detection verdict).
- The verdict renders **"FAILED"**, and a dedicated **"Correlation Failed"** block
  surfaces the error with a retry path.
The fix is unchanged from Phase 6.

**Status of the two Phase 6 NOT TESTED browser checks:**
- *Alert status change persisting after a browser refresh* — **now re-verified in
  the browser during Phase 7** (system Microsoft Edge via Playwright, isolated
  backend on `:8001` + temp DB, UI on `:5190`). A PATCH to a new status returned
  HTTP 200, the status badge updated to the new value, and the value persisted
  after reloading the page (`patchStatus:200, badgeResolvedVisible:true,
  persistedResolved:true`). See `docs/phase7-investigation-analytics.md` and
  `docs/phase7-browser-evidence/03-status.png`. The Phase 6 §14 row is left as
  originally recorded; this is the Phase 7 follow-up result.
- *Mobile hamburger-menu navigation to a specific view at a narrow viewport* —
  **still NOT TESTED.** The page renders and is error-free at 390px (Phase 6
  §14), but the automated menu-open remained inconclusive and was not re-driven
  in Phase 7. Verify manually.

No Phase 6 code, thresholds, or the demo database were touched during Phase 7.
See `docs/phase7-investigation-analytics.md` for the full Phase 7 record and
`docs/PROJECT_STATE.md` for the cross-agent source of truth.
