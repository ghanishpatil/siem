# SentinelX SIEM — API Reference

Derived from the actual FastAPI routes (`backend/app/api/`) and Pydantic schemas
(`backend/app/schemas/`). Examples were **captured from the running application**
against an isolated temporary database on 2026-10-18 (an AUTH-001 scenario: 10
`authentication_failure` events from one source IP within 60s), not invented.

- **Base URL (local):** `http://127.0.0.1:8000`
- **All routes are prefixed with `/api`.**
- **Timestamps** are returned as UTC ISO-8601 (e.g. `2026-10-17T12:00:00Z`).

> ⚠️ **No authentication.** Every endpoint below is unauthenticated. CORS limits
> which browser origins may call the API; it is **not** authentication and does
> not stop direct clients (curl, scripts). Do not expose this API publicly
> without an access-control layer. See `docs/phase9-security-hardening.md`.

---

## Conventions
- **State-changing** endpoints are marked. Reads never modify data.
- Interactive docs (`/docs`, `/redoc`, `/openapi.json`) are available in
  development and **disabled when `SIEM_ENVIRONMENT=production`**.
- Pagination: `limit` (bounded) and `offset`; list responses include `total`,
  `limit`, `offset`, `items`.

---

## GET /api/health — liveness & DB connectivity
**State-changing:** no.
Returns 200 when the database is reachable, **503** when it is not (so platform
health checks fail correctly). Cheap `SELECT 1`; no secrets exposed.

Example:
```http
GET /api/health
```
```json
{
  "status": "ok",
  "app": "SentinelX SIEM Correlation Engine",
  "version": "0.1.0",
  "environment": "development",
  "database": "connected",
  "timestamp": "2026-10-18T14:46:59.719103+00:00"
}
```
On DB failure: HTTP 503, `"status": "degraded"`, `"database": "unavailable"`.

---

## POST /api/events/ingest — ingest events
**State-changing:** yes.
Accepts a single JSON object, a JSON array of objects, or a JSONL file upload
(`multipart/form-data`, field `file`). Each record is validated and normalized
independently.

**Per-record fields:** `timestamp` (required; ISO-8601 or epoch seconds),
`event_type`, `source_ip`, `destination_ip`, `destination_port` (0–65535),
`username`, `host`, `source`, `severity`, `is_synthetic`, `event_uid` (optional;
generated if absent). Unknown extra keys are allowed and preserved in `raw_event`.

**Response** (`IngestSummary`): `received_count`, `accepted_count`,
`rejected_count`, `duplicate_count`, and arrays `accepted` / `duplicates` /
`rejected`.

**Status codes:** `201` all accepted · `207` partial (some accepted, some
rejected) · `400` nothing accepted but invalid present / no events / malformed
JSON · `200` all duplicates · `413` too large.

**Bounds:** ≤ 1000 events per JSON array; ≤ 5 MB JSON body; ≤ 10 MB and ≤ 10 000
records per JSONL upload.

Example request (array of 10 events, abbreviated):
```json
[
  {
    "event_uid": "demo-auth001-0",
    "timestamp": "2026-10-17T12:00:00Z",
    "event_type": "authentication_failure",
    "source_ip": "198.51.100.24",
    "username": "admin",
    "host": "web-01",
    "source": "demo",
    "severity": "medium",
    "is_synthetic": true
  }
]
```
Response — HTTP 201 (abbreviated `accepted`):
```json
{
  "received_count": 10,
  "accepted_count": 10,
  "rejected_count": 0,
  "duplicate_count": 0,
  "accepted": [
    { "index": 0, "id": 1, "event_uid": "demo-auth001-0" },
    { "index": 9, "id": 10, "event_uid": "demo-auth001-9" }
  ],
  "duplicates": [],
  "rejected": []
}
```
Validation example — missing required `timestamp` → HTTP **400**:
```json
{
  "received_count": 1,
  "accepted_count": 0,
  "rejected_count": 1,
  "duplicate_count": 0,
  "accepted": [],
  "duplicates": [],
  "rejected": [
    { "index": 0, "event_uid": null,
      "errors": [ { "field": "timestamp", "message": "timestamp is required" } ] }
  ]
}
```

---

## GET /api/events — list events
**State-changing:** no.
**Query params:** `limit` (default 50, 1–500), `offset` (≥ 0), `event_type`,
`severity`, `source_ip`. Order: newest first (`timestamp` desc, `id` desc).
**Response** (`EventListResponse`): `total`, `limit`, `offset`, `items[]`
(`EventResponse`).

Example:
```http
GET /api/events?limit=20&event_type=authentication_failure
```
An `EventResponse` item (shape, from the verified evidence output):
```json
{
  "id": 1,
  "event_uid": "demo-auth001-0",
  "timestamp": "2026-10-17T12:00:00Z",
  "event_type": "authentication_failure",
  "source_ip": "198.51.100.24",
  "destination_ip": null,
  "destination_port": null,
  "username": "admin",
  "host": "web-01",
  "source": "demo",
  "severity": "medium",
  "is_synthetic": true,
  "raw_event": { "event_uid": "demo-auth001-0", "timestamp": "2026-10-17T12:00:00Z", "event_type": "authentication_failure", "source_ip": "198.51.100.24", "username": "admin", "host": "web-01", "source": "demo", "severity": "medium", "is_synthetic": true },
  "created_at": "2026-10-18T14:46:59.743513Z"
}
```

---

## GET /api/events/{id} — one event
**State-changing:** no. Returns an `EventResponse`, or **404** `{"detail": "event not found"}`.

---

## GET /api/events/stats — event statistics
**State-changing:** no. Computed over stored rows.
```json
{
  "total_events": 10,
  "by_event_type": { "authentication_failure": 10 },
  "by_severity": { "medium": 10 },
  "recent_event_count": 0,
  "recent_window_hours": 24,
  "synthetic_count": 10,
  "real_count": 0
}
```
(`recent_event_count` counts events whose **event time** is within the last 24h;
it is 0 here because the sample events are back-dated.)

---

## POST /api/alerts/evaluate — run correlation
**State-changing:** yes (upserts alerts).
**Request body (optional):** `EvaluateRequest` with per-rule overrides:
```json
{ "rules": { "AUTH-001": { "enabled": true, "params": { "threshold": 8 } } } }
```
Only `enabled` (bool) and **positive-integer** `params` are accepted
(`extra` fields forbidden). An unknown rule id → **400**.
**Response** (`EvaluateSummary`): `events_evaluated`, `rules_enabled`,
`detections`, `alerts_created`, `alerts_updated`, `alerts_unchanged`, `alerts[]`
(`{id, fingerprint, rule_id, state}` where state ∈ created/updated/unchanged).
Safe to call repeatedly — unchanged evidence yields `alerts_created: 0`.

Example (no body) after ingesting the AUTH-001 scenario — HTTP 200:
```json
{
  "events_evaluated": 10,
  "rules_enabled": ["AUTH-001", "AUTH-002", "AUTH-003", "NET-001", "PRIV-001"],
  "detections": 1,
  "alerts_created": 1,
  "alerts_updated": 0,
  "alerts_unchanged": 0,
  "alerts": [
    { "id": 1,
      "fingerprint": "d35ebe0a49fb46aafd8605c8e42d18a7ea46aaabdb9f97196b1091cd86e2ddf0",
      "rule_id": "AUTH-001", "state": "created" }
  ]
}
```

---

## GET /api/alerts — list alerts
**State-changing:** no.
**Query params:** `limit` (default 50, 1–500), `offset`, `severity`, `status`,
`rule_id`. Order: most recently detected first.
**Response** (`AlertListResponse`): `total`, `limit`, `offset`, `items[]`
(`AlertResponse`). A verified `AlertResponse`:
```json
{
  "id": 1,
  "fingerprint": "d35ebe0a49fb46aafd8605c8e42d18a7ea46aaabdb9f97196b1091cd86e2ddf0",
  "rule_id": "AUTH-001",
  "rule_name": "Brute Force Authentication",
  "severity": "high",
  "description": "Many authentication failures from a single source IP within a short time window.",
  "status": "open",
  "source_ip": "198.51.100.24",
  "username": null,
  "host": "web-01",
  "matched_count": 10,
  "evidence_event_ids": [1,2,3,4,5,6,7,8,9,10],
  "explanation": {
    "rule_id": "AUTH-001",
    "reason": "10 authentication failures from 198.51.100.24 within 60s (threshold 10).",
    "threshold": 10, "window_seconds": 60, "failure_count": 10,
    "source_ip": "198.51.100.24"
  },
  "is_synthetic": true,
  "first_observed": "2026-10-17T12:00:00Z",
  "last_observed": "2026-10-17T12:00:45Z",
  "detected_at": "2026-10-18T14:46:59.786157Z",
  "created_at": "2026-10-18T14:46:59.786157Z",
  "updated_at": "2026-10-18T14:46:59.786157Z"
}
```
Note: alert `severity` is "high" (AUTH-001's rule severity) even though the
events were `medium` — severity is a property of the rule, not the event.

---

## GET /api/alerts/{id} — alert + evidence
**State-changing:** no. Returns `AlertDetailResponse` = `AlertResponse` plus an
`evidence` array of full `EventResponse` rows (resolved from
`evidence_event_ids`), or **404** `{"detail": "alert not found"}`.

```http
GET /api/alerts/1
```
Returns the alert object above plus:
```json
{
  "evidence": [
    { "id": 1, "event_uid": "demo-auth001-0", "timestamp": "2026-10-17T12:00:00Z",
      "event_type": "authentication_failure", "source_ip": "198.51.100.24",
      "destination_ip": null, "destination_port": null, "username": "admin",
      "host": "web-01", "source": "demo", "severity": "medium",
      "is_synthetic": true, "raw_event": { "...": "..." },
      "created_at": "2026-10-18T14:46:59.743513Z" }
  ]
}
```

---

## PATCH /api/alerts/{id} — update investigation status
**State-changing:** yes (status only; evidence/detection fields preserved).
**Request body** (`PatchAlertRequest`, `extra` forbidden):
```json
{ "status": "investigating" }
```
Allowed values: `open`, `acknowledged`, `investigating`, `resolved`,
`false_positive`, `closed`. **Response:** the updated `AlertResponse` (200).
Unknown alert → **404**. Invalid status → **422**:
```json
{
  "detail": [
    { "type": "enum", "loc": ["body", "status"],
      "msg": "Input should be 'open', 'acknowledged', 'investigating', 'resolved', 'false_positive' or 'closed'",
      "input": "not_a_status" }
  ]
}
```

---

## GET /api/alerts/stats — alert statistics
**State-changing:** no.
```json
{
  "total_alerts": 1,
  "by_severity": { "high": 1 },
  "by_status": { "investigating": 1 },
  "by_rule": { "AUTH-001": 1 }
}
```

---

## GET /api/alerts/rules — active rule configuration
**State-changing:** no. Returns a `RuleInfo[]`: `{id, name, description, severity,
enabled, params}` with the effective thresholds (see the rule catalogue in the
README / technical walkthrough).

---

## Error behavior summary
- Validation errors are structured; no stack traces or secrets are returned
  (FastAPI debug is off). Request-body schema violations (wrong type, forbidden
  extra field, bad enum) return **422**; ingestion field problems are reported
  per-record in the `rejected` array with the record's index.
- Internal errors return a generic **500** message; the transaction is rolled
  back. Unknown rule id on evaluate → **400**. Oversized ingest → **413**.

## curl / PowerShell quick examples
```powershell
# Health
Invoke-RestMethod http://127.0.0.1:8000/api/health

# Ingest a single event
$body = '{"timestamp":"2026-10-17T12:00:00Z","event_type":"authentication_failure","source_ip":"198.51.100.24","username":"admin"}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/events/ingest -ContentType application/json -Body $body

# Run correlation
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/alerts/evaluate

# List alerts, then update status
Invoke-RestMethod http://127.0.0.1:8000/api/alerts
Invoke-RestMethod -Method Patch -Uri http://127.0.0.1:8000/api/alerts/1 -ContentType application/json -Body '{"status":"investigating"}'
```
