"""API/integration tests for the correlation engine and alert endpoints.

These exercise the full stack through the HTTP API against an isolated
temporary database (via the ``client`` fixture in conftest.py): ingest events,
evaluate, then inspect persisted alerts.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.repositories import alert_repository

BASE = datetime(2026, 10, 16, 9, 0, 0, tzinfo=timezone.utc)
INGEST = "/api/events/ingest"
EVALUATE = "/api/alerts/evaluate"


def ts(offset_s: int) -> str:
    return (BASE + timedelta(seconds=offset_s)).isoformat().replace("+00:00", "Z")


def failure(uid, ip, user, offset, synthetic=True):
    return {
        "event_uid": uid,
        "timestamp": ts(offset),
        "event_type": "login_failed",
        "source_ip": ip,
        "username": user,
        "severity": "high",
        "is_synthetic": synthetic,
    }


def success(uid, ip, user, offset):
    return {
        "event_uid": uid,
        "timestamp": ts(offset),
        "event_type": "login_success",
        "source_ip": ip,
        "username": user,
        "severity": "info",
        "is_synthetic": True,
    }


def connection(uid, ip, port, offset):
    return {
        "event_uid": uid,
        "timestamp": ts(offset),
        "event_type": "network_connection",
        "source_ip": ip,
        "destination_port": port,
        "is_synthetic": True,
    }


def typed(uid, etype, user, offset):
    return {
        "event_uid": uid,
        "timestamp": ts(offset),
        "event_type": etype,
        "username": user,
        "is_synthetic": True,
    }


def ingest(client, events):
    resp = client.post(INGEST, json=events)
    assert resp.status_code in (200, 201, 207), resp.text
    return resp


def brute_force_events(ip="10.1.1.1", user="alice", n=10):
    return [failure(f"bf{i}", ip, user, i) for i in range(n)]


# ---------------- positive detections ----------------

def test_brute_force_alert_created_with_evidence(client):
    ingest(client, brute_force_events())
    summary = client.post(EVALUATE).json()
    assert summary["alerts_created"] == 1
    assert "AUTH-001" in summary["rules_enabled"]

    listing = client.get("/api/alerts").json()
    assert listing["total"] == 1
    alert = listing["items"][0]
    assert alert["rule_id"] == "AUTH-001"
    assert alert["severity"] == "high"
    assert alert["is_synthetic"] is True
    assert alert["matched_count"] == 10
    assert "reason" in alert["explanation"]

    detail = client.get(f"/api/alerts/{alert['id']}").json()
    assert len(detail["evidence"]) == 10
    assert sorted(e["id"] for e in detail["evidence"]) == sorted(alert["evidence_event_ids"])
    assert all(e["event_type"] == "authentication_failure" for e in detail["evidence"])


def test_password_spray_alert(client):
    ingest(client, [failure(f"sp{i}", "10.3.3.3", f"user{i}", i * 2) for i in range(5)])
    summary = client.post(EVALUATE).json()
    rules = {a["rule_id"] for a in client.get("/api/alerts").json()["items"]}
    assert "AUTH-002" in rules
    assert summary["alerts_created"] >= 1


def test_failures_then_success_alert(client):
    events = [failure(f"fs{i}", "10.4.4.4", "bob", i) for i in range(5)]
    events.append(success("fsok", "10.4.4.4", "bob", 10))
    ingest(client, events)
    client.post(EVALUATE)
    items = client.get("/api/alerts").json()["items"]
    auth003 = [a for a in items if a["rule_id"] == "AUTH-003"]
    assert len(auth003) == 1
    assert auth003[0]["severity"] == "critical"


def test_port_scan_alert(client):
    ingest(client, [connection(f"ps{i}", "10.2.2.2", 1000 + i, i) for i in range(15)])
    client.post(EVALUATE)
    items = client.get("/api/alerts").json()["items"]
    net = [a for a in items if a["rule_id"] == "NET-001"]
    assert len(net) == 1
    assert net[0]["explanation"]["distinct_port_count"] == 15


def test_privilege_escalation_alert(client):
    ingest(client, [typed("pv1", "privilege_escalation", "carol", 0), typed("pv2", "file_access", "carol", 5)])
    client.post(EVALUATE)
    items = client.get("/api/alerts").json()["items"]
    priv = [a for a in items if a["rule_id"] == "PRIV-001"]
    assert len(priv) == 1
    assert priv[0]["severity"] == "high"


# ---------------- dedup / determinism / disabled ----------------

def test_repeated_evaluation_does_not_duplicate(client):
    ingest(client, brute_force_events())
    first = client.post(EVALUATE).json()
    second = client.post(EVALUATE).json()
    assert first["alerts_created"] == 1
    assert second["alerts_created"] == 0
    assert second["alerts_unchanged"] >= 1
    assert client.get("/api/alerts").json()["total"] == 1


def test_determinism_same_fingerprint_and_evidence(client):
    ingest(client, brute_force_events())
    client.post(EVALUATE)
    a1 = client.get("/api/alerts").json()["items"][0]
    client.post(EVALUATE)
    a2 = client.get("/api/alerts").json()["items"][0]
    assert a1["fingerprint"] == a2["fingerprint"]
    assert a1["evidence_event_ids"] == a2["evidence_event_ids"]


def test_disabled_rule_produces_no_alert(client):
    ingest(client, brute_force_events())
    summary = client.post(EVALUATE, json={"rules": {"AUTH-001": {"enabled": False}}}).json()
    assert summary["alerts_created"] == 0
    assert "AUTH-001" not in summary["rules_enabled"]
    assert client.get("/api/alerts").json()["total"] == 0


def test_threshold_override_enables_detection(client):
    # Six failures: below the default threshold of 10.
    ingest(client, brute_force_events(n=6))
    assert client.post(EVALUATE).json()["alerts_created"] == 0
    summary = client.post(
        EVALUATE, json={"rules": {"AUTH-001": {"params": {"threshold": 5}}}}
    ).json()
    assert summary["alerts_created"] == 1


def test_unknown_rule_override_rejected(client):
    resp = client.post(EVALUATE, json={"rules": {"NOPE-999": {"enabled": True}}})
    assert resp.status_code == 400


# ---------------- pagination / filters / status / stats ----------------

def test_alert_pagination_and_filters(client):
    ingest(client, brute_force_events(ip="10.1.1.1"))
    ingest(client, [connection(f"ps{i}", "10.2.2.2", 1000 + i, i) for i in range(15)])
    client.post(EVALUATE)

    all_alerts = client.get("/api/alerts").json()
    assert all_alerts["total"] == 2

    only_net = client.get("/api/alerts?rule_id=NET-001").json()
    assert only_net["total"] == 1
    assert only_net["items"][0]["rule_id"] == "NET-001"

    only_high = client.get("/api/alerts?severity=high").json()
    assert only_high["total"] == 1  # AUTH-001 high; NET-001 is medium

    page = client.get("/api/alerts?limit=1&offset=0").json()
    assert len(page["items"]) == 1 and page["total"] == 2


def test_patch_status_and_invalid_status(client):
    ingest(client, brute_force_events())
    client.post(EVALUATE)
    alert_id = client.get("/api/alerts").json()["items"][0]["id"]

    ok = client.patch(f"/api/alerts/{alert_id}", json={"status": "investigating"})
    assert ok.status_code == 200
    body = ok.json()
    assert body["status"] == "investigating"
    assert body["matched_count"] == 10  # evidence/detection preserved

    bad = client.patch(f"/api/alerts/{alert_id}", json={"status": "not-a-status"})
    assert bad.status_code == 422

    missing = client.patch("/api/alerts/999999", json={"status": "closed"})
    assert missing.status_code == 404


def test_alert_stats_from_rows(client):
    ingest(client, brute_force_events())
    ingest(client, [connection(f"ps{i}", "10.2.2.2", 1000 + i, i) for i in range(15)])
    client.post(EVALUATE)
    stats = client.get("/api/alerts/stats").json()
    assert stats["total_alerts"] == 2
    assert stats["by_severity"]["high"] == 1
    assert stats["by_severity"]["medium"] == 1
    assert stats["by_status"]["open"] == 2
    assert stats["by_rule"]["AUTH-001"] == 1
    assert stats["by_rule"]["NET-001"] == 1


def test_rules_listing(client):
    rules = client.get("/api/alerts/rules").json()
    ids = [r["id"] for r in rules]
    assert ids == ["AUTH-001", "AUTH-002", "AUTH-003", "NET-001", "PRIV-001"]
    assert all(r["enabled"] for r in rules)
    brute = next(r for r in rules if r["id"] == "AUTH-001")
    assert brute["params"]["threshold"] == 10


def test_out_of_order_ingestion_still_detects(client):
    # Ingest failures with timestamps in reverse order.
    events = [failure(f"oo{i}", "10.9.9.9", "dave", 9 - i) for i in range(10)]
    ingest(client, events)
    client.post(EVALUATE)
    items = client.get("/api/alerts").json()["items"]
    assert any(a["rule_id"] == "AUTH-001" for a in items)


def test_evaluation_rolls_back_on_db_error(client, monkeypatch):
    ingest(client, brute_force_events())

    def boom(*_args, **_kwargs):
        raise RuntimeError("simulated alert persistence failure")

    monkeypatch.setattr(alert_repository, "upsert_alert", boom)
    resp = client.post(EVALUATE)
    assert resp.status_code == 500
    assert "internal error" in resp.json()["detail"].lower()
    assert client.get("/api/alerts").json()["total"] == 0
