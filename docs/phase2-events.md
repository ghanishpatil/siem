# Phase 2 — Event Ingestion, Normalization, and Persistence

This phase adds the first real backend functionality: accepting security
events, validating and normalizing them, persisting them to SQLite, retrieving
them, and computing statistics from actual stored rows. No correlation engine,
alerting, or dashboard work is included.

## Modules

| Concern | Module |
|---|---|
| ORM model | `app/models/event.py` |
| Controlled vocabularies | `app/normalization/vocab.py` |
| Validation + normalization | `app/normalization/normalizer.py` |
| Database access | `app/repositories/event_repository.py` |
| Request/response schemas | `app/schemas/event.py` |
| API routes | `app/api/events.py` |
| Table initialization | `app/db/init_db.py` (invoked from `app/main.py` lifespan) |

## Database schema (`events` table)

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | auto-increment |
| `event_uid` | VARCHAR(128) | unique, indexed; supplied or generated |
| `timestamp` | DATETIME | event time, stored naive UTC, indexed |
| `event_type` | VARCHAR(64) | normalized category, indexed |
| `source_ip` | VARCHAR(45) | nullable, indexed |
| `destination_ip` | VARCHAR(45) | nullable |
| `username` | VARCHAR(255) | nullable, indexed |
| `host` | VARCHAR(255) | nullable |
| `source` | VARCHAR(128) | log-source id; defaults to `unknown` |
| `severity` | VARCHAR(16) | normalized severity, indexed |
| `is_synthetic` | BOOLEAN | distinguishes demo data from real telemetry |
| `raw_event` | JSON | original payload, retained verbatim |
| `created_at` | DATETIME | ingestion time, naive UTC |

Composite index `ix_events_timestamp_id` supports the default newest-first
ordering.

## Normalization

- **event_type**: mapped to a fixed canonical set (`authentication_success`,
  `authentication_failure`, `authentication_logout`, `privilege_escalation`,
  `network_connection`, `port_scan`, `process_creation`, `file_access`,
  `unknown`). Unrecognized values become `unknown`; the original is kept in
  `raw_event`.
- **severity**: mapped to `critical | high | medium | low | info`. Missing or
  unrecognized values become `info`.
- **timestamp**: ISO-8601 (trailing `Z` accepted) or epoch seconds; converted
  to UTC. Missing or malformed timestamps are rejected.
- **source_ip / destination_ip**: validated with Python's `ipaddress`; invalid
  values are rejected.
- Client-supplied `event_type`/`severity` are never trusted blindly; original
  values are always preserved in `raw_event`.

## API contract

### `POST /api/events/ingest`

Accepts one of:
- a single JSON event object,
- a JSON array of event objects,
- a JSONL file upload (`multipart/form-data`, field name `file`).

Response body (all forms):

```json
{
  "received_count": 2,
  "accepted_count": 1,
  "rejected_count": 1,
  "duplicate_count": 0,
  "accepted": [{ "index": 0, "id": 1, "event_uid": "evt-1" }],
  "duplicates": [],
  "rejected": [
    { "index": 1, "event_uid": null,
      "errors": [{ "field": "timestamp", "message": "timestamp is required" }] }
  ]
}
```

Status codes: `201` all accepted · `207` partial (some accepted, some rejected)
· `400` nothing accepted (all invalid) or malformed body · `200` nothing new
(e.g. all duplicates) · `413` batch/upload/body limit exceeded · `500` internal
persistence error (generic message, no traceback).

Example (single event):

```bash
curl -X POST http://127.0.0.1:8000/api/events/ingest \
  -H "content-type: application/json" \
  -d '{"event_uid":"evt-1","timestamp":"2026-10-16T09:00:00Z",
       "event_type":"login_failed","source_ip":"10.0.0.5","username":"alice",
       "source":"linux-auth","severity":"high","is_synthetic":true}'
```

### `GET /api/events`

Query params: `limit` (1..`max_page_limit`, default 50), `offset` (>=0),
`event_type`, `severity`, `source_ip`. Ordering is deterministic
(`timestamp DESC, id DESC`). `event_type`/`severity` filters are normalized the
same way as ingested events.

```json
{ "total": 5, "limit": 2, "offset": 0, "items": [ /* EventResponse */ ] }
```

### `GET /api/events/{event_id}`

Returns a single `EventResponse`, or `404`.

### `GET /api/events/stats`

Computed from actual rows:

```json
{
  "total_events": 4,
  "by_event_type": { "authentication_failure": 3, "authentication_success": 1 },
  "by_severity": { "high": 3, "info": 1 },
  "recent_event_count": 3,
  "recent_window_hours": 24
}
```

`recent_event_count` counts events whose occurrence `timestamp` falls within
`recent_window_hours` of now (UTC).

## Limits (configurable via `app/config.py`, `SIEM_` env prefix)

| Setting | Default |
|---|---|
| `max_batch_size` | 1000 events per JSON array |
| `max_ingest_bytes` | 5,000,000 (JSON body) |
| `max_upload_bytes` | 10,000,000 (JSONL file) |
| `max_jsonl_records` | 10,000 lines |
| `default_page_limit` / `max_page_limit` | 50 / 500 |
| `recent_window_hours` | 24 |

JSONL uploads are read line by line to bound memory.

## Deviations from the brief

- **`is_synthetic` field added.** Supports the project-wide principle that
  synthetic demo data must be distinguishable from real telemetry. Optional on
  input (default `false`).
- **Timestamps stored as naive UTC.** SQLite has no native timezone storage;
  all timestamps are converted to UTC on the way in and re-presented as
  UTC-aware (`+00:00`) on the way out.
- **Naive input timestamps are assumed to be UTC** rather than rejected.
- **Unknown `event_type`/`severity` are accepted and labelled** (`unknown` /
  `info`) rather than rejected, with the original preserved in `raw_event`.
  Structural problems (non-object record, missing/invalid timestamp, invalid
  IP) are rejected.
