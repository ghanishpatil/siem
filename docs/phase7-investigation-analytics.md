# Phase 7 — Incident Investigation & Security Analytics

Focused investigation and analytics experience built on top of the existing
SentinelX stack. The guiding constraint for this phase: **reuse existing APIs.**
A backend change was introduced only where an existing endpoint genuinely could
not supply the data (see §4). No AI/LLM verdicts, no fabricated analytics, no
hardcoded dashboard counts — every number rendered comes from a live API
response computed over real stored rows.

Status labels: **PASS / FAIL / BLOCKED / NOT TESTED / NOT APPLICABLE**.
Last verified: **2026-10-16**.

## 1. Scope

Deliver a usable incident-investigation workflow and real security analytics
without regressing Phases 2–6:

- Chronological **evidence timeline** for an alert.
- **Investigation status** changes that are backend-confirmed and persistent.
- **Export** of an alert plus its evidence for hand-off.
- **Cross-navigation** between an alert's evidence and the Event Explorer, and
  from an event back to the alert(s) that reference it.
- **Overview analytics**: alerts by investigation status, and events by
  provenance (synthetic vs real) — derived from live stats.

Out of scope (explicitly not done): AI-generated threat verdicts, LLM-based
detection, any new detection rule, any change to detection thresholds, resetting
or seeding the demo database.

## 2. Files changed (and why)

Backend (one behavioral change, plus its test):
- `backend/app/repositories/event_repository.py` — `get_stats` now also computes
  `synthetic_count` / `real_count` via a `GROUP BY is_synthetic` over the real
  `events` table. Additive; existing fields unchanged.
- `backend/app/schemas/event.py` — `StatsResponse` gains `synthetic_count` and
  `real_count` (ints). Backward compatible; no field removed or renamed.
- `backend/tests/test_events.py` — added `test_stats_includes_provenance_counts`
  asserting the two new fields reflect actually-ingested synthetic/real rows.

Frontend (no new dependencies):
- `frontend/src/types/event.ts` — `StatsResponse` type extended with
  `synthetic_count` / `real_count` to match the API.
- `frontend/src/components/views/AlertsView.tsx` — chronological evidence
  timeline (`useMemo`, sorted by event `timestamp` ascending, `id` tiebreaker);
  JSON export of alert + evidence; inline status-error state (no native
  `alert()`); status reflected from the backend PATCH response (not optimistic);
  enriched evidence rows (src/dst/user/host/feed, provenance, raw-JSON inspect);
  "Open in Events →" per evidence row.
- `frontend/src/components/views/EventsView.tsx` — "Referenced by Alerts" reverse
  lookup for the inspected event (bounded scan of `listAlerts({limit:500})`
  filtered by `evidence_event_ids`), with an honest "scanned N of M most recent"
  note when the alert count exceeds the scan window; "Open alert →" navigation.
- `frontend/src/components/views/OverviewView.tsx` — two live-data analytics
  panels: **Alerts by Investigation Status** (from `AlertStatsResponse.by_status`)
  and **Events by Provenance** (from the new `synthetic_count` / `real_count`),
  each with empty / unavailable fallbacks.
- `frontend/src/App.tsx` — wired cross-tab navigation: `onNavigateToEvent` →
  AlertsView, `onNavigateToAlert` → EventsView, reusing the existing
  `targetAlertId` / `targetEventId` deep-link state.

## 3. Features and the exact APIs reused

| Feature | How it works | API(s) used |
|---|---|---|
| Evidence timeline | UI sorts `evidence[]` by event `timestamp` ascending (`id` tiebreaker) | `GET /api/alerts/{id}` (`AlertDetailResponse.evidence`) |
| Investigation status change | `<select>` → PATCH; displayed status taken from the response; inline error on failure | `PATCH /api/alerts/{id}` |
| Status persistence | Re-fetch on reopen/refresh shows the backend value | `GET /api/alerts/{id}`, `GET /api/alerts` |
| Export alert + evidence | Client-side JSON `Blob` download; filename `sentinelx-alert-<id>-<fp8>.json` | none (uses already-fetched detail) |
| Evidence → Event Explorer | Per-row "Open in Events →" sets a deep-link target | existing `getEvent` / `listEvents` in EventsView |
| Event → referencing alerts | Scan recent alerts, filter by `evidence_event_ids` containing the event id | `GET /api/alerts?limit=500` |
| Alerts-by-status analytics | Render `by_status` as proportional bars | `GET /api/alerts/stats` |
| Events-by-provenance analytics | Render synthetic vs real split | `GET /api/events/stats` (extended) |

No new frontend libraries were added (export is a native `Blob` + anchor
download; charts reuse the already-present Recharts).

## 4. The one backend change — justification

**Change:** `GET /api/events/stats` now returns `synthetic_count` and
`real_count` in addition to its existing fields.

**Why this needed a backend change rather than client computation:** the only
client-visible event feeds (`GET /api/events`, used by the Overview with
`limit=100`) are **paginated**, so counting provenance on the client would
describe only the fetched page, not the whole corpus — exactly the kind of
"dashboard count that doesn't match reality" this project forbids. The accurate
synthetic-vs-real split requires an aggregate over all rows, which belongs in the
stats endpoint that already performs `GROUP BY`-style aggregates.

**Why it is low risk:** additive, two integer fields; computed from the real
`events` table (`GROUP BY is_synthetic`); no existing field changed; covered by a
new unit test. The synthetic-vs-real metric is also directly aligned with the
project's core principle of keeping demo/synthetic data distinguishable from
real telemetry.

**Alternatives rejected:** (a) deriving counts from the paginated `listEvents`
response — inaccurate on any corpus larger than one page; (b) omitting the metric
— loses the one genuinely useful provenance analytic and leaves the Overview
panel with no real source.

Every other Phase 7 feature was implemented against **unchanged** existing
endpoints.

## 5. Data sources & integrity

- All analytics and investigation views render values returned by the live API,
  computed over real stored rows. No hardcoded counts; no client-side fabrication.
- Timeline order is derived from each event's own `timestamp`; it does not invent
  times. Verified against an out-of-order seed (events ingested in non-chronological
  id order still render ascending by event time).
- Status shown after a change is the value the backend returned from the PATCH,
  not an optimistic guess; a failed PATCH leaves the status unchanged and shows an
  inline error.
- The event→alert reverse lookup is explicit about its bound: it scans the most
  recent 500 alerts and says so when more exist, rather than implying completeness.

## 6. Security & privacy

- No new network-exposed endpoint was created; the single backend change extends
  an existing read-only stats route. (The stack as a whole remains unauthenticated
  — appropriate for a local single-user demo, but it is **not** hardened for
  multi-user or network exposure; see `docs/PROJECT_STATE.md` §known limitations.)
- Export is produced and downloaded entirely in the browser; nothing is sent to a
  third party. The exported JSON contains whatever is already in the alert and its
  evidence (including any PII present in the ingested events) — treat exported
  files as sensitive.
- No secrets were read or written. The demo database was not reset or seeded.

## 7. Tests executed

**Backend** — `cd backend ; .\.venv\Scripts\python.exe -m pytest -q`
→ **68 passed, 1 warning**. (67 from Phase 6 + the new
`test_stats_includes_provenance_counts`.) The single warning is the Starlette
`TestClient` httpx deprecation — non-fatal, pre-existing.

**Frontend production build** — `cd frontend ; npm run build`
→ `tsc --noEmit` clean + `vite build` → **BUILD_RESULT=OK** (~0.9s vite step).
A non-zero PowerShell exit code appears only because Vite prints an advisory
chunk-size warning to stderr; `cmd /c "npm run build && echo BUILD_RESULT=OK"`
confirms success.

**Browser acceptance** — system **Microsoft Edge** driven via a cached Playwright
module (`channel: 'msedge'`, headless). No browser or framework was downloaded or
installed. Driven against an **isolated** stack: a throwaway backend on `:8001`
with a temporary SQLite DB, and a temporary Vite dev server on `:5190` proxying
`/api` to `:8001`. The demo DB (`:8000` / `backend/sentinelx.db`) was never
written to; the temp DB, temp Vite config, and scripts were deleted afterward.

| Browser check | Result | Evidence |
|---|---|---|
| Isolated seed ingests cleanly and yields a correlatable alert | PASS | 13 accepted, 1 alert |
| Overview analytics render (status bars + provenance split) from live stats | PASS | 01-analytics.png |
| Evidence timeline renders | PASS | 10 rows; 02-timeline.png |
| Timeline is chronological despite out-of-order ingest | PASS | ascending by event time |
| Export produces a JSON file with alert + evidence | PASS | `sentinelx-alert-1-*.json`, evidence=10, synthetic flag present |
| Status change persists after a full browser refresh | PASS | `patchStatus:200, badgeResolvedVisible:true, persistedResolved:true`; 03-status.png |
| Event → referencing-alert navigation works | PASS | opened the alert from an event |
| No fatal JS errors across the run | PASS | 0 pageerrors |

Evidence screenshots: `docs/phase7-browser-evidence/01-analytics.png`,
`02-timeline.png`, `03-status.png`.

**Detection rules** — the five rules (AUTH-001/002/003, NET-001, PRIV-001) remain
present and pass in the backend suite; Phase 7 changed no rule or threshold.

## 8. Known limitations

- **Event → alert reverse lookup is bounded** to the 500 most-recent alerts. On a
  corpus with more than 500 alerts, an older referencing alert could fall outside
  the scan; the UI discloses "scanned N of M most recent" in that case. Adequate
  for a local demo; a dedicated `GET /api/events/{id}/alerts` endpoint would be the
  clean long-term fix.
- **Export is JSON only** (no PDF/CSV). Deliberate — avoids adding a PDF/report
  dependency for a demo.
- **No authentication** anywhere in the stack (unchanged from earlier phases).
- **Mobile hamburger-menu navigation** remains NOT TESTED in-browser (carried over
  from Phase 6 §14/§18); verify manually.
- Frontend bundle is ~0.9 MB raw (advisory chunk-size warning only).

## 9. Remaining work

- Manual check: mobile hamburger navigation to a specific view at a narrow
  viewport (the only remaining NOT TESTED item).
- Optional: a dedicated event→alerts endpoint to remove the 500-alert scan bound.
- Optional: CSV/PDF export, and frontend code-splitting to clear the chunk-size
  advisory.

None of these are blockers for closing Phase 7.

## 10. Launch commands

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

Open the URL Vite prints (5173 if free, else the next port). Landing → "Open
Security Console" → Overview (analytics), Alerts (timeline / status / export),
Event Explorer (referenced-by-alerts).

## 11. Phase 7 outcome

All in-scope features implemented against existing APIs save for a single
justified, tested, backward-compatible stats extension. Backend **68 passed**;
frontend build **OK**; browser acceptance **all PASS** on an isolated stack; the
Phase 6 `evaluation_failed` fix and the Phase 6 verification document are intact.
Phase 7 is **ready to close**, with the one carried-over mobile-nav check recorded
honestly as NOT TESTED.
