# Phase 3 — Correlation Engine and Persistent Alerts

A deterministic, evidence-based correlation engine that evaluates persisted
events against configurable rules and upserts explainable alerts. No machine
learning, no LLM, no arbitrary code execution.

## Processing architecture (event → alert)

```
events (SQLite)
   │  event_repository.fetch_for_detection (bounded, ordered by time,id)
   ▼
EventView[]  (pure projections, no ORM)
   │  detection.engine.evaluate  — sorts by (timestamp, id), runs enabled rules
   ▼
Detection[]  (evidence ids, entities, explanation, fingerprint, provenance)
   │  detection.service.evaluate_and_persist  (single transaction)
   ▼
alert_repository.upsert_alert  — insert new / update changed / skip unchanged
   ▼
alerts (SQLite)
```

- **Rules** (`app/detection/rules/*`) are pure functions over `EventView` lists —
  independently testable, no DB.
- **Engine** (`app/detection/engine.py`) sorts events once (out-of-order safe),
  runs enabled rules in fixed order, returns detections in stable order.
- **Service** (`app/detection/service.py`) is the only DB-touching detection
  component: loads events, runs the engine, upserts alerts in one transaction,
  rolls back on error. Safe to call repeatedly.

## Rule definitions and default thresholds

| ID | Name | Severity | Correlate by | Defaults |
|----|------|----------|--------------|----------|
| AUTH-001 | Brute Force Authentication | high | source_ip | threshold 10 failures, window 60s |
| AUTH-002 | Password Spraying | high | source_ip | distinct_accounts 5, window 300s |
| AUTH-003 | Failed Logins Followed by Success | critical | source_ip + username | min_failures 5, window 300s |
| NET-001 | Potential Port Scan | medium | source_ip | distinct_ports 15, window 60s |
| PRIV-001 | Suspicious Privilege Escalation | high | username | window 300s |

Rule semantics and safety:
- **AUTH-001**: only `authentication_failure` events; failures without a source
  IP are ignored; sources are never combined.
- **AUTH-002**: only failures with a known account; counts distinct usernames
  per source IP within the window.
- **AUTH-003**: requires both source IP and username; counts failures strictly
  *before* a success and within the window; success-before-failures does not
  trigger.
- **NET-001**: only `network_connection` events with a valid `destination_port`;
  missing ports are never counted as port evidence.
- **PRIV-001**: requires a genuine `privilege_escalation` event followed by a
  sensitive action (`file_access` or `process_creation`) by the same account
  within the window; generic/unknown events never count. The sensitive-action
  mapping is defined in `app/normalization/vocab.py` (`SENSITIVE_ACTION_TYPES`).

Rules are configurable per evaluation via a validated request body (enable flag
and positive-integer thresholds only). `GET /api/alerts/rules` lists effective
configuration.

## Event schema extension

A nullable `destination_port` (INTEGER) column was added to the `events` table
for NET-001. Fresh databases get it via `create_all`; pre-existing databases are
migrated with `ALTER TABLE events ADD COLUMN destination_port INTEGER` in
`app/db/init_db.py` (SQLite-supported, non-destructive). `destination_port` is
validated (0–65535) during normalization.

## Alert fingerprint and deduplication

- **Fingerprint** = `sha256(rule_id + sorted correlation entities)`:
  - AUTH-001 / AUTH-002 / NET-001 → `rule_id + source_ip`
  - AUTH-003 → `rule_id + source_ip + username`
  - PRIV-001 → `rule_id + username`
- **Policy (aggregating upsert)**: one alert per (rule, entity). Re-evaluating
  the same window leaves the alert **unchanged** (no duplicates). When new
  evidence changes the match (count, evidence set, severity, span), the existing
  alert is **updated** in place — `first_observed`/`last_observed` widen, evidence
  and explanation refresh, `detected_at`/`updated_at` bump. Investigation
  `status` and `created_at` are preserved. Newly relevant evidence is never
  silently discarded.

## Alert model (`alerts` table)

`id` · `fingerprint` (unique) · `rule_id` · `rule_name` · `severity` ·
`description` · `status` · `source_ip` · `username` · `host` · `matched_count` ·
`evidence_event_ids` (JSON int array) · `explanation` (JSON object) ·
`is_synthetic` · `first_observed` · `last_observed` · `detected_at` ·
`created_at` · `updated_at`. Timestamps are naive UTC, returned UTC-aware.

## API contracts

- **POST `/api/alerts/evaluate`** — optional body `{"rules": {"AUTH-001":
  {"enabled": false, "params": {"threshold": 5}}}}`. Returns
  `{events_evaluated, rules_enabled, detections, alerts_created, alerts_updated,
  alerts_unchanged, alerts:[{id, fingerprint, rule_id, state}]}`. Unknown rule id → 400.
- **GET `/api/alerts`** — `limit` (1–500), `offset`, `severity`, `status`,
  `rule_id`; ordered `detected_at DESC, id DESC`; returns `{total, limit, offset, items}`.
- **GET `/api/alerts/{id}`** — alert plus `evidence` (resolved event rows), or 404.
- **PATCH `/api/alerts/{id}`** — `{"status": "<allowed value>"}`; validated enum
  (invalid → 422); preserves evidence/detection fields; 404 if not found.
- **GET `/api/alerts/stats`** — `{total_alerts, by_severity, by_status, by_rule}`
  from rows.
- **GET `/api/alerts/rules`** — read-only effective rule configuration.

Allowed statuses: `open`, `acknowledged`, `investigating`, `resolved`,
`false_positive`, `closed`.

## Determinism and provenance

- Events sorted by `(timestamp, id)`; evidence ids sorted ascending; detections
  sorted by `(rule_id, fingerprint)`. Identical input + config ⇒ identical output.
- Evidence uses distinct stored event primary keys (ingestion already dedups by
  `event_uid`), so duplicates are not double-counted.
- `alert.is_synthetic = all(evidence events is_synthetic)`, so demonstration
  detections stay distinguishable from real telemetry.

## Demonstration procedure

With the backend running (`uvicorn app.main:app`), ingest synthetic events and
evaluate. Example distinct entities so each rule fires once:

| Rule | Synthetic input |
|------|-----------------|
| AUTH-001 | 10 `login_failed` from one IP within 60s |
| AUTH-002 | `login_failed` against 5 distinct users from one IP within 300s |
| AUTH-003 | 5 `login_failed` then 1 `login_success` (same IP+user) within 300s |
| NET-001 | 15 `network_connection` to distinct `destination_port`s from one IP within 60s |
| PRIV-001 | `privilege_escalation` then `file_access` (same user) within 300s |

Then `POST /api/alerts/evaluate`, `GET /api/alerts`, `GET /api/alerts/{id}` (to
see resolved evidence), `GET /api/alerts/stats`. Re-run evaluate to confirm no
duplicates (`alerts_created: 0`, `alerts_unchanged: 5`).

## Limitations

- Aggregating dedup keyed on (rule, entity) without a time bucket: distinct
  bursts from the same entity update one alert rather than creating separate
  incident alerts. This is the documented lifecycle policy for the demo.
- A single evaluation scans up to `max_events_scan` (100,000) events in memory;
  adequate for local demonstration, not tuned for very large datasets.
- Per-call rule overrides are stateless (not persisted); defaults define the
  baseline reported by `/api/alerts/rules`.
- `detected_at` reflects the latest create/update, not every evaluation run.
