"""API-level tests for Phase 2 event ingestion, retrieval, and statistics."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from app.repositories import event_repository

INGEST = "/api/events/ingest"


def make_event(**overrides):
    event = {
        "event_uid": "evt-1",
        "timestamp": "2026-10-16T09:00:00Z",
        "event_type": "login_failed",
        "source_ip": "10.0.0.5",
        "username": "alice",
        "host": "web-01",
        "source": "linux-auth",
        "severity": "high",
        "is_synthetic": True,
    }
    event.update(overrides)
    return event


def test_ingest_single_valid(client):
    resp = client.post(INGEST, json=make_event())
    assert resp.status_code == 201
    body = resp.json()
    assert body["received_count"] == 1
    assert body["accepted_count"] == 1
    assert body["rejected_count"] == 0
    assert body["duplicate_count"] == 0
    accepted = body["accepted"][0]
    assert accepted["event_uid"] == "evt-1"

    got = client.get(f"/api/events/{accepted['id']}")
    assert got.status_code == 200
    event = got.json()
    assert event["event_type"] == "authentication_failure"  # normalized
    assert event["severity"] == "high"
    assert event["source_ip"] == "10.0.0.5"
    assert event["timestamp"].startswith("2026-10-16T09:00:00")
    assert event["raw_event"]["event_type"] == "login_failed"  # original preserved


def test_ingest_multiple_valid(client):
    payload = [
        make_event(event_uid="a"),
        make_event(event_uid="b", event_type="login_success", severity="info"),
    ]
    resp = client.post(INGEST, json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["received_count"] == 2
    assert body["accepted_count"] == 2
    assert client.get("/api/events").json()["total"] == 2


def test_ingest_jsonl(client):
    lines = "\n".join(json.dumps(make_event(event_uid=f"l{i}")) for i in range(2))
    resp = client.post(
        INGEST, files={"file": ("events.jsonl", lines.encode(), "application/x-ndjson")}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["received_count"] == 2
    assert body["accepted_count"] == 2


def test_malformed_json_returns_400(client):
    resp = client.post(
        INGEST, content="{not valid json", headers={"content-type": "application/json"}
    )
    assert resp.status_code == 400
    assert "valid JSON" in resp.json()["detail"]


def test_jsonl_malformed_line_is_partial(client):
    content = json.dumps(make_event(event_uid="ok-1")) + "\n" + "{broken json\n"
    resp = client.post(
        INGEST, files={"file": ("events.jsonl", content.encode(), "application/x-ndjson")}
    )
    assert resp.status_code == 207
    body = resp.json()
    assert body["received_count"] == 2
    assert body["accepted_count"] == 1
    assert body["rejected_count"] == 1
    assert body["rejected"][0]["index"] == 1


def test_missing_optional_fields_ok(client):
    resp = client.post(
        INGEST, json={"timestamp": "2026-10-16T09:00:00Z", "event_type": "login_failed"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["accepted_count"] == 1
    accepted = body["accepted"][0]
    assert accepted["event_uid"]  # generated, non-empty

    event = client.get(f"/api/events/{accepted['id']}").json()
    assert event["source_ip"] is None
    assert event["username"] is None
    assert event["host"] is None
    assert event["source"] == "unknown"
    assert event["severity"] == "info"


def test_invalid_timestamp_rejected(client):
    resp = client.post(INGEST, json=make_event(timestamp="not-a-date"))
    assert resp.status_code == 400
    body = resp.json()
    assert body["accepted_count"] == 0
    assert body["rejected_count"] == 1
    fields = [e["field"] for e in body["rejected"][0]["errors"]]
    assert "timestamp" in fields


def test_missing_timestamp_rejected(client):
    resp = client.post(INGEST, json={"event_type": "login_failed"})
    assert resp.status_code == 400
    body = resp.json()
    assert body["rejected_count"] == 1
    fields = [e["field"] for e in body["rejected"][0]["errors"]]
    assert "timestamp" in fields


def test_invalid_ip_rejected(client):
    resp = client.post(INGEST, json=make_event(source_ip="999.1.1.1"))
    assert resp.status_code == 400
    body = resp.json()
    assert body["rejected_count"] == 1
    fields = [e["field"] for e in body["rejected"][0]["errors"]]
    assert "source_ip" in fields


def test_duplicate_uid_across_requests(client):
    first = client.post(INGEST, json=make_event(event_uid="dup"))
    assert first.status_code == 201
    second = client.post(INGEST, json=make_event(event_uid="dup"))
    assert second.status_code == 200
    body = second.json()
    assert body["accepted_count"] == 0
    assert body["duplicate_count"] == 1
    assert client.get("/api/events").json()["total"] == 1


def test_duplicate_uid_within_batch(client):
    resp = client.post(INGEST, json=[make_event(event_uid="z"), make_event(event_uid="z")])
    assert resp.status_code == 201
    body = resp.json()
    assert body["accepted_count"] == 1
    assert body["duplicate_count"] == 1


def test_pagination_and_ordering(client):
    for i in range(5):
        client.post(
            INGEST,
            json=make_event(event_uid=f"p{i}", timestamp=f"2026-10-16T09:0{i}:00Z"),
        )
    page1 = client.get("/api/events?limit=2&offset=0").json()
    assert page1["total"] == 5
    assert len(page1["items"]) == 2
    assert page1["items"][0]["timestamp"].startswith("2026-10-16T09:04:00")
    assert page1["items"][1]["timestamp"].startswith("2026-10-16T09:03:00")
    page2 = client.get("/api/events?limit=2&offset=2").json()
    assert page2["items"][0]["timestamp"].startswith("2026-10-16T09:02:00")


def test_filter_by_event_type(client):
    client.post(INGEST, json=make_event(event_uid="f1", event_type="login_failed"))
    client.post(INGEST, json=make_event(event_uid="f2", event_type="login_success"))
    # Filter accepts synonyms and normalizes them.
    filtered = client.get("/api/events?event_type=login_success").json()
    assert filtered["total"] == 1
    assert filtered["items"][0]["event_type"] == "authentication_success"


def test_get_event_404(client):
    assert client.get("/api/events/999999").status_code == 404


def test_stats_from_actual_records(client):
    recent_ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    client.post(INGEST, json=make_event(event_uid="s1", event_type="login_failed", severity="high", timestamp=recent_ts))
    client.post(INGEST, json=make_event(event_uid="s2", event_type="login_failed", severity="high", timestamp=recent_ts))
    client.post(INGEST, json=make_event(event_uid="s3", event_type="login_success", severity="info", timestamp=recent_ts))
    client.post(INGEST, json=make_event(event_uid="s4", event_type="login_failed", severity="high", timestamp="2000-01-01T00:00:00Z"))

    stats = client.get("/api/events/stats").json()
    assert stats["total_events"] == 4
    assert stats["by_event_type"]["authentication_failure"] == 3
    assert stats["by_event_type"]["authentication_success"] == 1
    assert stats["by_severity"]["high"] == 3
    assert stats["by_severity"]["info"] == 1
    assert stats["recent_event_count"] == 3  # the year-2000 event is outside the window


def test_timestamp_normalized_to_utc(client):
    resp = client.post(INGEST, json=make_event(event_uid="tz", timestamp="2026-10-16T12:00:00+05:00"))
    event_id = resp.json()["accepted"][0]["id"]
    event = client.get(f"/api/events/{event_id}").json()
    assert event["timestamp"].startswith("2026-10-16T07:00:00")  # 12:00+05:00 -> 07:00 UTC


def test_batch_size_limit(client, monkeypatch):
    monkeypatch.setattr("app.config.settings.max_batch_size", 2)
    payload = [make_event(event_uid=f"big{i}") for i in range(3)]
    resp = client.post(INGEST, json=payload)
    assert resp.status_code == 413


def test_jsonl_record_limit(client, monkeypatch):
    monkeypatch.setattr("app.config.settings.max_jsonl_records", 1)
    content = "\n".join(json.dumps(make_event(event_uid=f"r{i}")) for i in range(2))
    resp = client.post(
        INGEST, files={"file": ("e.jsonl", content.encode(), "application/x-ndjson")}
    )
    assert resp.status_code == 413


def test_transaction_rollback_on_db_error(client, monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("simulated database failure")

    monkeypatch.setattr(event_repository, "add_events", boom)
    resp = client.post(INGEST, json=make_event(event_uid="fail"))
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert "internal error" in detail.lower()
    assert "traceback" not in detail.lower()
    # Nothing was persisted.
    assert client.get("/api/events").json()["total"] == 0


def test_stats_includes_provenance_counts(client):
    client.post(INGEST, json=make_event(event_uid="prov-syn-1", is_synthetic=True))
    client.post(INGEST, json=make_event(event_uid="prov-syn-2", is_synthetic=True))
    client.post(INGEST, json=make_event(event_uid="prov-real-1", is_synthetic=False))

    stats = client.get("/api/events/stats").json()
    assert stats["total_events"] == 3
    assert stats["synthetic_count"] == 2
    assert stats["real_count"] == 1
