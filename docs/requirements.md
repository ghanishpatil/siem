# Requirements — SentinelX SIEM Correlation Engine (CIS-117)

## 1. Purpose

Deliver a working, custom SIEM correlation engine that collects security
events, normalizes them, stores them, correlates them with deterministic rules,
and presents explainable, evidence-linked alerts in a dashboard. Target
demonstration date: **19 October 2026**.

## 2. Scope

In scope: local event ingestion, normalization, persistence, a deterministic
correlation engine with configurable rules, explainable alerts, and a security
dashboard. Out of scope: connecting to production systems, acting against
external hosts, probabilistic/ML detection, and multi-user auth/RBAC.

## 3. Functional requirements

- **FR-1 Ingestion.** Accept security events via an HTTP API with strict
  schema validation.
- **FR-2 Normalization.** Convert raw events into a single canonical event
  schema, independent of detection logic.
- **FR-3 Persistence.** Store raw and normalized events, and generated alerts,
  in a local SQLite database via a dedicated data-access layer.
- **FR-4 Correlation.** Evaluate canonical events against deterministic,
  configurable rules.
- **FR-5 Alerts.** Produce alerts that link to the exact events (evidence) that
  triggered them and include a human-readable explanation of why they fired.
- **FR-6 Dashboard.** Display events, alerts, alert detail (evidence +
  explanation), and summary visualizations.
- **FR-7 Synthetic data.** Clearly distinguish synthetic demo data from real
  collected telemetry throughout the pipeline and UI.
- **FR-8 Live updates (later phase).** Push new events/alerts to the dashboard
  over WebSockets.

### Planned detection rules (phased, one at a time)

1. Repeated authentication failures.
2. Password spraying (one source against many accounts).
3. Repeated failures followed by a successful authentication.
4. Potential port scanning.
5. Suspicious privilege-escalation sequences.

## 4. Non-functional requirements

- **NFR-1 Local-only.** All development, data, and testing run on a local
  machine. No external network actions.
- **NFR-2 Modularity.** Clear separation between API, validation, persistence,
  normalization, and detection (see `architecture.md`).
- **NFR-3 Determinism.** Given the same events and rules, detection output is
  identical every run. This is a hard requirement for a reliable demo.
- **NFR-4 Explainability.** Every alert states which events and which rule
  produced it, and why.
- **NFR-5 No hardcoded secrets.** Configuration comes from the environment.
- **NFR-6 Tested.** Backend logic is covered by pytest; each phase is verified
  before the next starts.

## 5. Phased delivery plan

| Phase | Deliverable                                                        |
|-------|--------------------------------------------------------------------|
| 0     | Scaffolding, docs, venv, dependencies, `/health`, frontend reaches backend |
| 1     | Event ingestion API + validation + raw persistence (+ tests)       |
| 2     | Normalization to canonical schema (+ tests)                        |
| 3     | Correlation engine + Rule 1 (repeated auth failures), explainable alerts (+ tests) |
| 4     | Dashboard: event feed, alert list, alert detail, Recharts summaries |
| 5     | Remaining rules (2–5), one at a time (+ tests)                     |
| 6     | WebSockets live updates                                            |
| 7     | Demo hardening: synthetic seed script, polish, full run-through    |

Given the demonstration date, Phases 0–4 form the committed vertical slice;
Phases 5–6 are stretch goals.

## 6. Acceptance criteria (demo)

- Events can be ingested and are validated and stored.
- At least one deterministic rule produces an alert whose evidence and
  explanation are visible in the dashboard.
- Synthetic demo data is visibly distinguished from real telemetry.
- Backend tests pass locally.
