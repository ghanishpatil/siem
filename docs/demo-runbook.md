# SentinelX SIEM — Demonstration Runbook

A reliable **7–10 minute** live demo using only the current implementation and
**verified commands**. It generates its data live via the Attack Simulation Lab,
so it does **not** depend on any pre-existing database contents or fabricated
counts.

## Database safety (read first)
- The **persistent demo database** is `backend/sentinelx.db`. This runbook does
  **not** touch it.
- The demo runs the backend against a **dedicated, disposable session database**
  (`backend/demo_session.db`) via `SIEM_DATABASE_URL`, so the live demo starts
  clean every time and the persistent DB is never modified.
- `*.db` files are git-ignored. After the demo you may delete
  `backend/demo_session.db`; never delete `sentinelx.db`.

---

## A. Pre-demo checklist (do this before the audience arrives)
1. Python 3.10.x and Node 20.x available: `python --version`, `node --version`.
2. Backend venv exists and deps installed (`backend/.venv`); if not, see
   `README.md` §12 / §18.
3. Frontend deps installed (`frontend/node_modules`); if not: `cd frontend; npm install`.
4. One rehearsal run of this runbook completed successfully.
5. Browser zoom ~100–110%; close noisy tabs.

## B. Environment & port checks (PowerShell)
```powershell
# From F:\siem. Check the ports the demo will use.
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object OwningProcess
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object OwningProcess
```
If 8000 is busy, identify the owner with `Get-Process -Id <PID>` and either stop
*your own* process or start the backend on another port (`--port 8010`) and the
frontend proxy will still target 8000 — so prefer freeing 8000, or update
`frontend/vite.config.ts` proxy target if you must change it. **Do not kill
unknown processes.** Vite auto-picks the next free port if 5173 is taken.

## C. Start the backend (Terminal 1)
```powershell
cd F:\siem\backend
$env:SIEM_DATABASE_URL = "sqlite:///./demo_session.db"   # dedicated session DB
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Leave it running. (Omitting the `SIEM_DATABASE_URL` line would use the persistent
`sentinelx.db` instead — only do that intentionally.)

## D. Health-check verification (Terminal 3, or a browser)
```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```
**Expected:** `status = ok`, `database = connected`, `version = 0.1.0`.
(If `database` is not `connected`, see §K recovery.)

## E. Start the frontend (Terminal 2)
```powershell
cd F:\siem\frontend
npm run dev
```
Open the URL Vite prints (usually `http://localhost:5173`).

---

## Live demo script (narrate as you go)

### 1. Landing page (~30s)
Show the landing page. Point out the clearly-labeled **SAMPLE / ILLUSTRATIVE**
telemetry widgets (these are illustrative, not live data — honesty point). Click
**Open Security Console**.

### 2. Dashboard / Overview (~45s)
You're now in the SOC console. With the session DB this starts essentially empty
— say so ("this is a clean session database"). Point out the left nav:
**Overview, Alerts, Event Explorer, Detection Rules, Log Ingestion, Simulation
Lab**. Open **Detection Rules** briefly to show the five deterministic rules and
their thresholds.

### 3. Simulation Lab — generate a synthetic attack (~1m)
Open **Simulation Lab**. Note the amber **SIMULATION MODE** banner (synthetic
events only, RFC 5737 test IPs). On the **AUTH-001 (Brute Force)** card click
**Generate Scenario**.
**Expected:** stepper shows *Generated*; ~10 synthetic `authentication_failure`
events listed; inspect one to show `is_synthetic: true`. **No alert yet** — say
"generation is client-side only; nothing has hit the backend."

### 4. Explicit ingestion (~45s)
Click **Ingest Events to API**.
**Expected:** real counts from `POST /api/events/ingest` (accepted = number
generated, rejected 0). Stepper → *Ingested*. Optionally switch to **Alerts** and
back to show there is still **no alert** — ingestion never auto-correlates.

### 5. Explicit correlation (~1m)
Click **RUN CORRELATION**.
**Expected:** this calls `POST /api/alerts/evaluate`; verdict advances to
**DETECTED** with an alert reference (rule **AUTH-001**, severity **high**).
Emphasize: *correlation is a deliberate action, and the verdict comes from the
real backend engine.*

### 6. Alert & evidence (~1.5m)
Click **Open Incident Details** (or go to **Alerts** and select the alert).
**Expected:** the detail panel shows the **Detection Explanation** (e.g. *"10
authentication failures from … within 60s (threshold 10)"*), entities, and an
**Evidence Timeline** of the exact events (chronological by event time). Open a
row's **Raw JSON** to show the stored payload; use **Open in Events →** to show
cross-navigation to the Event Explorer.

### 7. Investigation status + persistence (~1m)
In the alert detail, change **Investigation Status** (e.g. to *Investigating* or
*Resolved*) using the dropdown.
**Expected:** a success banner; the status badge updates (value comes from the
backend `PATCH /api/alerts/{id}` response). **Refresh the browser** and reopen the
alert — the status is still the new value (persisted server-side).

### 8. Analytics + JSON export (~1m)
Go to **Overview**. Show **Alerts by Investigation Status** and **Events by
Provenance** (synthetic vs real) — all driven by live `/api/*/stats`. Back in the
alert detail, click **Export Alert + Evidence (JSON)**.
**Expected:** a file downloads, named like
`sentinelx-alert-<id>-<fingerprint8>.json`, containing the alert plus its
evidence events.

### 9. Honest limitations (~45s)
State plainly:
- Detection is **deterministic rules**, not machine learning.
- The API has **no authentication** yet; this is a controlled local demo, not a
  public multi-user SIEM.
- Storage is **SQLite** (single-writer); deployment is **configured** for Vercel +
  Railway but **not deployed/verified**.

---

## Expected observable results (quick reference)
| Step | Expect |
|---|---|
| Health | `status: ok`, `database: connected` |
| Generate | ~10 synthetic events, `is_synthetic: true`, no alert |
| Ingest | accepted = generated count, rejected 0, still no alert |
| Correlate | verdict **DETECTED**, AUTH-001, severity high |
| Evidence | explanation + timeline of the triggering events |
| Status | updates and persists after a full page refresh |
| Analytics | status + provenance panels reflect the new data |
| Export | JSON file downloads with alert + evidence |

## K. Recovery if a step fails
- **Health not `connected` / 503:** confirm Terminal 1 is still running and
  `SIEM_DATABASE_URL` points at a writable path; restart the backend. Do **not**
  delete any database.
- **Frontend can't reach API (errors / offline banner):** confirm the backend is
  on 8000 and `/api/health` is 200; the dev proxy is in `frontend/vite.config.ts`.
- **Correlation shows "Correlation Failed":** the backend was unreachable or
  errored — verify Terminal 1, then click **RUN CORRELATION** again (safe to
  retry; evaluation is idempotent).
- **No alert after correlation:** make sure you clicked **Ingest** before **RUN
  CORRELATION**, and that you used a full scenario (AUTH-001 needs ≥ 10 failures).
  Re-generate → re-ingest → re-correlate.
- **Port 8000 busy:** start the backend on `--port 8010` and update the proxy
  target, or free 8000 (never kill unknown processes).
- **Clean restart of the demo:** stop the backend (Ctrl+C in Terminal 1), delete
  only `backend/demo_session.db`, and repeat §C. `sentinelx.db` is untouched.

## Post-demo cleanup (optional)
Stop both terminals (Ctrl+C). Optionally remove the session DB:
```powershell
Remove-Item F:\siem\backend\demo_session.db -ErrorAction SilentlyContinue
```
Never remove `backend/sentinelx.db`.
