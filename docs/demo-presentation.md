# SentinelX SIEM — Demonstration Script & Q&A

A 7–10 minute presentation to accompany `docs/demo-runbook.md`. Timings are
guidance. Every claim here matches the implementation — do not embellish.

---

## Presentation outline (with talk track)

### 0:00–0:45 — Framing
**Say:** "SentinelX is a deterministic SIEM correlation engine. It ingests
security events, normalizes them, and correlates them with five explicit rules to
produce explainable, evidence-linked alerts. It is rule-based — no machine
learning — so every alert can be justified exactly."
**Show:** the landing page; point out the SAMPLE/ILLUSTRATIVE labels (honesty).

### 0:45–1:30 — Architecture in one breath
**Say:** "React + Vite frontend, FastAPI + SQLAlchemy backend, SQLite storage.
The frontend only talks to the backend over a typed `/api`. The backend is
layered: thin routes, a normalization layer, a pure detection engine with five
rules, and repositories that own all database access."
**Show:** the dashboard nav (Overview, Alerts, Event Explorer, Detection Rules,
Log Ingestion, Simulation Lab); open **Detection Rules** to show the five rules
and thresholds.

### 1:30–4:30 — The core loop (Simulation Lab)
**Say:** "I'll demonstrate the full pipeline with a synthetic brute-force
scenario. Three deliberate steps: generate, ingest, correlate."
**Show:** Simulation Lab → **Generate Scenario** (AUTH-001) → **Ingest Events to
API** → **RUN CORRELATION** → **DETECTED**.
**Emphasize:** generation is client-side; ingestion only stores events;
correlation is an explicit action that calls the real engine. No alert exists
until the threshold is actually met.

### 4:30–6:30 — Investigation
**Say:** "Here's what makes it a SIEM, not just a log viewer: the alert explains
itself and carries its evidence."
**Show:** Open Incident Details → the **explanation** (reason/threshold/window) →
the **evidence timeline** → change **investigation status** → refresh to prove
persistence → **Export Alert + Evidence (JSON)**.

### 6:30–8:00 — Analytics + honesty
**Show:** Overview → **Alerts by Investigation Status**, **Events by Provenance**
(synthetic vs real), all from live stats.
**Say (limitations, plainly):** "Detection is deterministic rules, not ML. The
API has no authentication yet, so this is a controlled local demo. Storage is
SQLite. Deployment to Vercel and Railway is configured but not performed."

### 8:00–10:00 — Wrap + questions
**Say:** "In summary: a working, explainable correlation engine with a real
investigation workflow, honest synthetic-vs-real provenance, and a documented
path to hardening and deployment." Then take questions (below).

---

## Technical points worth emphasizing
- **Deterministic & explainable:** same inputs → same alerts; each alert stores
  its exact reason, threshold, window, and entities.
- **Evidence-linked:** alerts reference the precise events that triggered them.
- **Idempotent correlation:** re-running evaluation does not duplicate alerts or
  reset analyst status (stable fingerprint upsert).
- **Honest failure handling:** a failed evaluation shows a distinct FAILED state,
  never a false "no detection".
- **Provenance:** synthetic demo data is always flagged and counted separately.
- **Clean layering + tests:** 70 backend tests pass; typed production build passes.

---

## Expected questions & accurate answers

**Q: What makes this a SIEM?**
A: It performs the core SIEM functions: centralized event ingestion and
normalization to a canonical schema, persistence, rule-based **correlation**
across multiple events, and explainable, evidence-linked **alerting** with an
investigation workflow (status lifecycle, timeline, export) and analytics. It is
a focused educational implementation, not an enterprise product.

**Q: How are detection rules implemented?**
A: As pure Python functions in `backend/app/detection/rules/`, each operating on
an in-memory view of events over a sliding time window with explicit thresholds
(e.g. AUTH-001: ≥ 10 `authentication_failure` from one `source_ip` within 60s).
The engine runs enabled rules; rules never touch the database.

**Q: How does the system avoid duplicate alerts?**
A: Each detection has a stable **fingerprint** (rule id + correlation entities).
Evaluation upserts by fingerprint: new → created, changed evidence → updated
(status preserved), unchanged → no write. So re-evaluating the same events is
idempotent.

**Q: Can it ingest real telemetry?**
A: Yes — the ingestion API accepts any JSON/JSONL events matching the schema, and
every event has an `is_synthetic` flag so real and synthetic data stay
distinguishable. There are no built-in production log-source connectors yet; you
would POST events from your own shipper.

**Q: Does it use machine learning?**
A: No. Detection is entirely deterministic rules. That's a deliberate design
choice for explainability and reproducibility.

**Q: Why is correlation manually triggered?**
A: To keep the model transparent and the demo honest: ingestion only stores
events; correlation is a distinct, explicit action (`POST /api/alerts/evaluate`).
It also makes evaluation idempotent and easy to reason about. A scheduler could
call the same endpoint later.

**Q: What happens if the database fails?**
A: The health endpoint reports it honestly — `GET /api/health` returns **503**
with `database: "unavailable"` instead of a misleading 200. Write operations roll
back on error, and in production the app refuses to start on an ephemeral/unsafe
database path rather than silently losing data.

**Q: Is the platform production-ready?**
A: Not for unrestricted public use. It is a well-tested controlled demo. The main
gap is the absence of authentication/authorization; there is also no storage
retention or automated backup. Those are documented, with a hardening plan.

**Q: How is authentication handled?**
A: It isn't yet — that's the primary known limitation. CORS limits browser
origins but is not authentication. The recommendation is to keep the backend
access-restricted (platform auth / private networking) until a real auth layer is
added; a smallest-first plan is in `docs/phase9-security-hardening.md`.

**Q: How would this scale beyond SQLite?**
A: SQLite is single-writer, so today you run one backend instance. Because data
access is isolated in the repository layer and the DB URL is configurable
(`SIEM_DATABASE_URL`, a SQLAlchemy URL), moving to a client/server database such
as PostgreSQL is the natural path; it isn't wired up or tested yet, so I wouldn't
claim it works today.

**Q: Where do the alert severities come from?**
A: From the rule definition, not the event. AUTH-003 is critical; AUTH-001/002,
PRIV-001 are high; NET-001 is medium.

---

## Honest limitations (say these if asked, don't hide them)
- No authentication/authorization; not safe for public exposure as-is.
- Deterministic rules only; no ML; no anomaly detection.
- SQLite single-writer; no retention/quota; no automated backup.
- Deployment is configured for Vercel + Railway but **not deployed or verified**.
- Browser acceptance was executed in Phase 7; it was **not re-run** in Phase 10.

## Future improvements
Authentication + authorization (or platform access control); storage retention,
quotas, and automated backup; a frontend CSP; optional real log-source
connectors; PostgreSQL for horizontal scale; CSV/PDF export; scheduled
correlation; frontend code-splitting.
