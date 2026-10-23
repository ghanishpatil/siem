# Phase 9 — Security Hardening & Final Quality Assurance

Application-security review and final QA pass on the existing SentinelX SIEM.
This phase inspects the real code, fixes justified defects with minimal changes,
runs the regression suite, and documents remaining risk honestly. **The
application is still NOT deployed** to Vercel or Railway; no platform-specific
runtime behavior was verified in situ.

Repository root: **`F:\siem`** (confirmed: `git rev-parse --show-toplevel` →
`F:/siem`). Date: **2026-10-17**. Course: CIS-117.
Status labels: **PASS / FAIL / BLOCKED / NOT TESTED / NOT APPLICABLE**.

---

## 1. Headline assessment

The codebase is **defensively well-built**: strict input validation, controlled
vocabularies, parameterized ORM access, `extra="forbid"` + enum/positive-int
schema validation, bounded ingestion, single-transaction writes with rollback,
non-destructive migrations, generic error messages, and React output encoding
with **no** dangerous HTML sinks. The dominant risk is **architectural, not a
code bug**: the API has **no authentication/authorization**, so if the Railway
backend is exposed to the public internet, anyone can ingest events, run
correlation, read all data, and change alert statuses.

**Conclusion up front:** public, unrestricted deployment is **not appropriate**
without authentication or platform-level access control. As a controlled,
access-restricted portfolio demo it is acceptable, with the limitations below.

## 2. Threat model

Each row: Threat · Component · Preconditions · Impact · Existing mitigations ·
Recommended fix · Severity · Verification.

| # | Threat | Component | Preconditions | Impact | Existing mitigations | Recommended fix | Severity | Verified by |
|---|--------|-----------|---------------|--------|----------------------|-----------------|----------|-------------|
| 1 | Unauthenticated API access | All routes | Public backend | Anyone reads/writes all data | CORS limits browsers only; strong validation; no destructive ops | Don't expose publicly w/o auth; platform access control; real auth (plan §7) | **High** (if public) | Code review: no auth dep on any route |
| 2 | Unauthorized alert status change | `PATCH /api/alerts/{id}` | Public backend | Investigation integrity (status flips) | Status enum validated; evidence preserved; no delete | Authz for writes | Medium | `schemas/alert.py`, `update_status` |
| 3 | Malformed event ingestion | `/events/ingest`, normalizer | Reachable API | Bad/garbage data | Per-record validation (IP/port/timestamp), per-record rejection, raw payload stored not executed | None needed | Low | `normalizer.py` + `test_events.py` |
| 4 | Oversized JSON/JSONL upload (DoS) | ingest handlers | Reachable API | Memory/CPU pressure | `max_ingest_bytes` 5 MB, `max_batch_size` 1000, `max_upload_bytes` 10 MB, `max_jsonl_records` 10 000, content-length check, line-by-line read | None needed; edge limits add defense | Low | `events.py` + tests |
| 5 | Unbounded ingestion → disk exhaustion | ingest → SQLite volume | Public, repeated ingest | Volume fills → availability | Per-request bounds only; **no retention/quota** | Add retention/quota or auth; monitor volume | Medium (if public) | Code review: no retention policy |
| 6 | Repeated correlation (CPU) | `/alerts/evaluate` | Public backend | CPU load | Scan bounded to `max_events_scan` 100 000; idempotent; single txn | Rate limiting / auth | Low–Med | `service.py` |
| 7 | SQLite locking / write contention | SQLite engine | Concurrency / >1 replica | "database is locked"; corruption if multi-replica on one volume | Single shared engine; txn rollback; single-replica guidance (Phase 8) | Enforce 1 replica; consider `busy_timeout`/WAL (future, needs testing) | Medium (operational) | `session.py`; Phase 8 doc |
| 8 | Unsafe filesystem paths | DB path, uploads | — | Path abuse | DB path from env + safe parent-dir create; prod guard rejects ephemeral; JSONL parsed in memory, no temp files | None needed | Low | `session.py`, `init_db.py`, `events.py` |
| 9 | Secrets in logs/config/responses | logging, config, health | — | Secret disclosure | No app logging of bodies/secrets; no hardcoded secrets; health hides DB URL; `.env` git-ignored | None needed | Low | grep + `config.py`/`health.py` |
| 10 | Sensitive error responses | all handlers | — | Internal disclosure | Generic 500s; debug off; normalizer returns structured field errors only | None needed | Low | `events.py`/`alerts.py`/`create_app` |
| 11 | Cross-origin browser requests | CORS | — | Unapproved browser origins | Explicit env allowlist; credentials disabled; prod wildcard warning (Phase 9) | Set exact Vercel origin; avoid `*` | Low (no creds/auth → limited CSRF) | `config.py`, `main.py` |
| 12 | XSS via untrusted event fields | frontend render | — | Script execution | React escaping; **no** `dangerouslySetInnerHTML`/`innerHTML`/`eval`; raw JSON via `<pre>{JSON.stringify}</pre>`; headers added (Phase 9) | CSP (future, needs backend origin + live test) | Low | grep (no sinks) + review |
| 13 | Export of sensitive evidence | AlertsView JSON export | Dashboard access | Evidence/PII written to user disk | User-initiated, client-side only (no 3rd party) | Document sensitivity | Low | `AlertsView.tsx` (Blob, no network) |
| 14 | Insecure deployment config | Vercel/Railway | Misconfig | Broken/insecure prod | Env-driven API base (no localhost fallback), persistence guard, health 503, security headers, docs gated | Follow Phase 8 checklist; set CORS; 1 replica | Medium (if misconfig) | Phase 8 + Phase 9; in-situ NOT TESTED |
| 15 | Dependency vulnerabilities | FE/BE deps | — | Known CVEs | `npm audit` 0 vulns; pinned BE versions current | Add `pip-audit` to CI | Low (none confirmed) | `npm audit`; `pip list` review |
| 16 | Missing backups/recovery | SQLite volume | Data loss event | No restore path | Volume persists across redeploys; manual backup documented (Phase 8) | **No automated backup** — schedule off-volume copy | Medium (durability) | Config review; none exists |
| 17 | Abuse of public simulation workflow | Sim Lab → real API | Public FE/BE | Synthetic-event/storage inflation | Events flagged `is_synthetic`; correlation explicit; RFC 5737 IPs; no auto-seed | Auth / disable sim in prod (optional) | Low–Med | Sim Lab review (Phase 6) |

## 3. Confirmed security issues (and disposition)

- **No authentication/authorization (Threat 1/2/5/6/17).** Confirmed by review:
  no route declares any auth dependency. **Disposition:** documented as the
  primary limitation; deployment restriction recommended (§13/§14); auth
  implementation plan provided (§7). Not "fixed" in code because a safe fix is an
  architectural addition (see §7) and a shared secret cannot live in a public SPA.
- **No global storage quota / retention (Threat 5).** Confirmed. **Disposition:**
  documented; recommend auth + retention + volume monitoring before public use.
- **No automated database backup (Threat 16).** Confirmed. **Disposition:**
  documented operational limitation + recommendation.
- **SQLite single-writer (Threat 7).** Confirmed by design. **Disposition:**
  single-replica deployment is mandated in Phase 8/9 docs.

No code-level vulnerability (injection, XSS, path traversal, secret leak, unsafe
deserialization, traceback disclosure) was found. Claims above are based on
direct source inspection, not assumption.

## 4. Changes made this phase (minimal, justified)

Backend:
- `app/main.py` — added a **security-response-headers** middleware
  (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Cache-Control: no-store`) applied to every
  response; **gated the interactive docs / OpenAPI schema off in production**
  (`/docs`, `/redoc`, `/openapi.json` → 404 when `SIEM_ENVIRONMENT=production`);
  added a **startup warning** if production is configured with a wildcard CORS
  origin. No route behavior or response bodies changed.
- `backend/tests/test_security_headers.py` — new regression test asserting the
  headers are present on success (200) and error (404) responses.

Frontend:
- `frontend/vercel.json` — added safe static-site security headers
  (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy` disabling camera/mic/geo). A strict **CSP was
  intentionally NOT added** (it needs the backend origin in `connect-src` and
  live testing to avoid breaking the SPA/charts — see §12).

No detection logic, rules, thresholds, schemas, database, or Phase 6/7/8 reports
were modified. No authentication system was invented. No secret was added to any
`VITE_*` variable.

## 5. Input validation & upload security — reviewed

- Timestamps required and parsed (ISO-8601 / epoch; booleans rejected; overflow
  handled). IPs validated via `ipaddress`; invalid → rejection. Ports constrained
  to 0–65535 (booleans rejected). `event_type`/`severity` mapped to controlled
  vocabularies; unknown → safe defaults with the original preserved in
  `raw_event`. One bad record is rejected individually, not the whole batch.
- Upload bounds enforced before heavy processing (byte, batch, JSONL-record
  limits; content-length pre-check; line-by-line JSONL read for bounded memory).
  Invalid JSON → 400. Duplicate `event_uid` handled (in-batch and vs DB).
- Rule overrides: `extra="forbid"`, thresholds must be positive integers
  (booleans rejected); unknown rule id → 400. Alert status: `AlertStatus` enum
  only (invalid → 422). **No validation was weakened.**

## 6. API exposure & authorization

| Endpoint | Type | Public exposure consequence |
|---|---|---|
| `POST /api/events/ingest` | write | Anyone can inject events / consume storage |
| `POST /api/alerts/evaluate` | write (compute) | Anyone can trigger correlation (CPU) |
| `PATCH /api/alerts/{id}` | write | Anyone can change investigation status |
| `GET /api/events*`, `GET /api/alerts*`, `GET /api/*/stats` | read | Anyone can read all events/alerts/evidence |
| `GET /api/health` | read | Liveness + env name (no secrets) |

All are currently **unauthenticated**. CORS restricts *browser* origins but does
**not** stop direct API clients (curl, scripts). Export is client-side and
inherits whatever the caller can already read.

## 7. Authentication & authorization assessment

**Decision: not implemented in Phase 9; documented with a plan.** Rationale:
- A real identity system (login, sessions/tokens, authz, secret storage, UI) is a
  significant architectural addition; the brief says not to invent one hastily.
- A shared API key / secret **cannot** be safely embedded in a public SPA bundle
  (it would be world-readable), so it is not a valid fix for the deployed browser
  app and would break the interactive demo or leak the key.

**Recommended approaches (future phase), smallest-first:**
1. **Platform access control (no code):** Vercel Password Protection / Vercel
   Authentication on the frontend, plus Railway private networking or an IP
   allowlist / auth proxy in front of the backend. Fastest way to make a
   restricted demo safe.
2. **Reverse-proxy / identity provider:** put both behind an OIDC provider
   (e.g., Cloudflare Access, Auth0/Clerk) — no custom crypto.
3. **App-level auth:** add OIDC/JWT validation middleware on the backend gating
   **write** endpoints first; frontend performs a login flow and sends a bearer
   token; secrets live only in Railway env; CORS unchanged; add tests and keep
   local-dev working via a dev bypass flag. Prefer a maintained library over
   hand-rolled tokens.

Until one of these is in place, **restrict access** (see §13).

## 8. CORS & deployment configuration — reviewed

- Origins from `SIEM_CORS_ORIGINS` (comma-separated or JSON; verified Phase 8).
  Credentials disabled. Dev default is localhost only. Phase 9 adds a startup
  warning if production uses a wildcard `*`. No wildcard is used by default.
- Production refuses an ephemeral SQLite path (Phase 8 guard); DB init is
  non-destructive; `$PORT` honored; env-driven frontend API base with no
  localhost fallback and a clear console error when unset in production.
- **In-situ Railway/Vercel behavior remains NOT TESTED** (no platform access).

## 9. Database integrity & recovery — reviewed

- Unique constraints on `event_uid` and alert `fingerprint`; dedup is correct and
  idempotent (unchanged evidence → no new alert, status preserved). Evidence
  references resolve via `evidence_event_ids`; status updates preserve evidence
  and other detection fields. Migrations are additive (`create_all` +
  `ALTER TABLE ADD COLUMN`), never destructive. Failed writes roll back (events,
  alert upsert, status update). DB health failures now surface as **503**.
- **Recovery/backup:** no automated backup exists. Recommendation: schedule a
  periodic copy of `/data/sentinelx.db` off the volume; verify restores. **No
  recovery test was invented.** Volume persistence across a real redeploy is
  **NOT TESTED** (requires Railway).

## 10. Detection & regression results — PASS

- All five rules present and passing (AUTH-001/002/003, NET-001, PRIV-001);
  thresholds unchanged. Correlation idempotent; evidence resolvable; status
  persists; ingestion works; Simulation Lab uses the real API and never creates
  alerts directly (correlation requires an explicit button click — confirmed:
  `evaluateAlerts()` has only the two button handlers as call sites); investigation
  timeline uses real evidence; JSON export contains the selected alert + evidence;
  analytics use live stats.
- **Backend suite: 70 passed, 1 warning** (68 prior + 2 new security-header
  tests). Warning = Starlette `TestClient` httpx deprecation (non-fatal).
- **Frontend build: BUILD_RESULT=OK** (`tsc --noEmit` clean + `vite build`).
- **Production checks (local):** `/docs` & `/openapi.json` → 404 in production;
  security headers present on 200 and 404; health 200 healthy / 503 on DB failure.

## 11. Dependency audit

- **Frontend:** `npm audit` → **found 0 vulnerabilities**.
- **Backend:** `pip-audit` is **not installed** (reported limitation — not added,
  to avoid introducing a tool/network dependency this phase). Manual review of the
  pinned versions found nothing obviously vulnerable: `python-multipart 0.0.32`
  (well past the multipart-DoS fix), `starlette 1.7.0`, `fastapi 0.143.2`,
  `pydantic 2.14.1`, `sqlalchemy 2.0.54`, `uvicorn 0.54.0`, `certifi 2026.7.22`.
  No dependency was upgraded. Recommendation: add `pip-audit` to CI for ongoing
  monitoring.

## 12. Frontend security — reviewed

- No `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, or
  `new Function` anywhere. All event/alert strings render through React (escaped).
  Raw payloads render as `<pre>{JSON.stringify(raw_event, null, 2)}</pre>` and
  copy/export via clipboard/Blob — no HTML injection path.
- Links are static internal anchors (`#capabilities`, etc.); no user-controlled
  `href` and no `target="_blank"` reverse-tabnabbing.
- API failures cannot render as successful detections (the Phase 6
  `evaluation_failed` → "Correlation Failed" path is intact). Only `VITE_API_BASE_URL`
  (a URL, not a secret) is exposed to the bundle.
- **CSP not added:** a correct policy needs `connect-src` = the (currently
  unknown) Railway origin and `style-src 'unsafe-inline'` for Recharts/React inline
  styles; shipping an untested CSP risks breaking the app. Recommended as a
  follow-up once the backend origin is known and can be live-tested.

## 13. Recommended deployment restrictions

Until authentication or platform access control is in place:
- **Do not** expose the Railway backend to the open internet unrestricted.
- Restrict access via Vercel password protection/authentication and Railway
  private networking / IP allowlist / an auth proxy.
- Set `SIEM_CORS_ORIGINS` to the exact Vercel origin (never `*`).
- Run the backend as a **single replica** (SQLite single-writer).
- Treat the instance as a **controlled demo** with non-sensitive/synthetic data;
  do not store real/regulated data.
- Schedule an off-volume backup of the SQLite file.

## 14. Is public deployment appropriate?

**No — not for unrestricted public exposure.** The API is unauthenticated, so an
open deployment allows anyone to read all data and perform writes. It is suitable
only as an **access-restricted, controlled demonstration** with the restrictions
in §13. This is a deployment/operational limitation, not a defect in the
application's internal logic.

## 15. Known limitations

- No authentication/authorization (Threats 1/2/5/6/17).
- No storage quota/retention; no automated DB backup.
- SQLite single-writer → one replica only; not horizontally scalable.
- No CSP on the frontend yet (safe headers added; CSP deferred).
- Carried-over NOT TESTED (Phase 6/7): mobile hamburger-menu navigation.

## 16. Items NOT tested (BLOCKED on platform access)

- Any real Vercel/Railway deployment and its runtime security behavior.
- In-situ CORS, HTTPS, security headers as served by the platforms.
- Volume persistence across a real redeploy/restart.
- Behavior of the production docs-gating / 503 health as seen by Railway's probe
  (verified locally only).
- Backend `pip-audit` scan (tool not installed).

## 17. Acceptance criteria status

Threat model ✅ · API exposure reviewed ✅ · Auth limitations documented + plan ✅ ·
Input validation reviewed ✅ · Upload limits reviewed ✅ · CORS/prod config reviewed ✅ ·
DB integrity reviewed ✅ · Frontend rendering reviewed ✅ · Dependency audit attempted
✅ (npm 0 vulns; pip-audit unavailable) · Five rules functional ✅ · Backend suite
passes ✅ (70) · Frontend build passes ✅ · Sim Lab functional ✅ · Investigation
workflow functional ✅ · Demo DB preserved ✅ · This doc exists ✅ · PROJECT_STATE
updated ✅ · Unverified deployment claims remain explicitly unverified ✅.

Passing tests do **not** mean the application is production-secure: the
unauthenticated-exposure limitation stands.
