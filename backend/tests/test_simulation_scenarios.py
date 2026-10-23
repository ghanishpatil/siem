"""End-to-end integration tests for Phase 6 Attack Simulation Lab scenarios.

Verifies:
1. Scenario A — AUTH-001: Brute Force Authentication
2. Scenario B — AUTH-002: Password Spraying
3. Scenario C — AUTH-003: Authentication Failures Followed by Success
4. Scenario D — NET-001: Potential Port Scan
5. Scenario E — PRIV-001: Suspicious Privilege Escalation
6. Malformed and duplicate synthetic event handling
7. Isolation: Ingestion does NOT create alerts automatically (explicit correlation required)
8. Idempotence: Repeated correlation evaluation does not duplicate alerts
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import pytest

BASE_TIME = datetime(2026, 10, 17, 10, 0, 0, tzinfo=timezone.utc)
INGEST_URL = "/api/events/ingest"
EVALUATE_URL = "/api/alerts/evaluate"
ALERTS_URL = "/api/alerts"


def iso_ts(seconds_offset: int) -> str:
    return (BASE_TIME + timedelta(seconds=seconds_offset)).isoformat().replace("+00:00", "Z")


# ---------------- SCENARIO A: AUTH-001 BRUTE FORCE ----------------

def test_simulation_scenario_auth_001_brute_force(client):
    """Scenario A: 10 authentication failures from single IP within 20s (threshold: 10 / 60s)."""
    origin_ip = "198.51.100.21"
    events = []
    for i in range(10):
        events.append({
            "event_uid": f"sim-bf-test-{i+1}",
            "timestamp": iso_ts(i * 2),
            "event_type": "authentication_failure",
            "source_ip": origin_ip,
            "destination_ip": "10.0.0.10",
            "destination_port": 22,
            "username": "admin",
            "host": "bastion-host-01",
            "source": "simulation-lab",
            "severity": "high",
            "is_synthetic": True,
            "raw_event": {"test": "auth-001"},
        })

    # Step 1: Ingest events
    ingest_resp = client.post(INGEST_URL, json=events)
    assert ingest_resp.status_code in (200, 201), ingest_resp.text
    summary = ingest_resp.json()
    assert summary["received_count"] == 10
    assert summary["accepted_count"] == 10
    assert summary["rejected_count"] == 0
    assert summary["duplicate_count"] == 0

    # Verify no alerts created automatically
    alerts_before = client.get(ALERTS_URL).json()
    assert alerts_before["total"] == 0

    # Step 2: Explicit correlation
    eval_resp = client.post(EVALUATE_URL)
    assert eval_resp.status_code == 200, eval_resp.text
    eval_data = eval_resp.json()
    assert eval_data["detections"] >= 1
    assert eval_data["alerts_created"] >= 1

    # Step 3: Verify alert and evidence
    alerts_after = client.get(ALERTS_URL).json()
    assert alerts_after["total"] >= 1
    matching = [a for a in alerts_after["items"] if a["rule_id"] == "AUTH-001" and a["source_ip"] == origin_ip]
    assert len(matching) == 1
    alert = matching[0]
    assert alert["severity"] == "high"
    assert alert["matched_count"] == 10
    assert len(alert["evidence_event_ids"]) == 10

    # Step 4: Verify idempotence on repeat evaluation
    repeat_eval = client.post(EVALUATE_URL).json()
    assert repeat_eval["alerts_created"] == 0
    assert repeat_eval["alerts_unchanged"] >= 1


# ---------------- SCENARIO B: AUTH-002 PASSWORD SPRAYING ----------------

def test_simulation_scenario_auth_002_password_spray(client):
    """Scenario B: 6 auth failures across 6 distinct users from single IP (threshold: 5 / 300s)."""
    origin_ip = "198.51.100.32"
    users = ["sec_admin_01", "analyst_01", "devops_01", "finance_01", "sys_op_01", "it_dir_01"]
    events = []
    for i, u in enumerate(users):
        events.append({
            "event_uid": f"sim-spray-test-{i+1}",
            "timestamp": iso_ts(i * 3),
            "event_type": "authentication_failure",
            "source_ip": origin_ip,
            "destination_ip": "10.0.0.25",
            "destination_port": 443,
            "username": u,
            "host": "auth-gateway-02",
            "source": "simulation-lab",
            "severity": "high",
            "is_synthetic": True,
            "raw_event": {"test": "auth-002"},
        })

    ingest_resp = client.post(INGEST_URL, json=events)
    assert ingest_resp.status_code in (200, 201)
    summary = ingest_resp.json()
    assert summary["accepted_count"] == 6

    eval_resp = client.post(EVALUATE_URL)
    assert eval_resp.status_code == 200

    alerts = client.get(ALERTS_URL).json()
    matching = [a for a in alerts["items"] if a["rule_id"] == "AUTH-002" and a["source_ip"] == origin_ip]
    assert len(matching) == 1
    alert = matching[0]
    assert alert["severity"] == "high"
    assert alert["matched_count"] == 6


# ---------------- SCENARIO C: AUTH-003 FAILURES THEN SUCCESS ----------------

def test_simulation_scenario_auth_003_failures_then_success(client):
    """Scenario C: 5 failures followed by 1 success for same (IP, username) within 300s."""
    origin_ip = "198.51.100.43"
    target_user = "operator_c77"
    events = []

    # 5 failures
    for i in range(5):
        events.append({
            "event_uid": f"sim-f2s-test-fail-{i+1}",
            "timestamp": iso_ts(i * 2),
            "event_type": "authentication_failure",
            "source_ip": origin_ip,
            "destination_ip": "10.0.0.12",
            "destination_port": 3389,
            "username": target_user,
            "host": "rdp-srv-01",
            "source": "simulation-lab",
            "severity": "medium",
            "is_synthetic": True,
            "raw_event": {"test": "auth-003-fail"},
        })

    # 1 success
    events.append({
        "event_uid": "sim-f2s-test-success",
        "timestamp": iso_ts(12),
        "event_type": "authentication_success",
        "source_ip": origin_ip,
        "destination_ip": "10.0.0.12",
        "destination_port": 3389,
        "username": target_user,
        "host": "rdp-srv-01",
        "source": "simulation-lab",
        "severity": "low",
        "is_synthetic": True,
        "raw_event": {"test": "auth-003-succ"},
    })

    ingest_resp = client.post(INGEST_URL, json=events)
    assert ingest_resp.status_code in (200, 201)
    summary = ingest_resp.json()
    assert summary["accepted_count"] == 6

    eval_resp = client.post(EVALUATE_URL)
    assert eval_resp.status_code == 200

    alerts = client.get(ALERTS_URL).json()
    matching = [
        a for a in alerts["items"]
        if a["rule_id"] == "AUTH-003" and a["source_ip"] == origin_ip and a["username"] == target_user
    ]
    assert len(matching) == 1
    alert = matching[0]
    assert alert["severity"] == "critical"
    assert alert["matched_count"] == 6


# ---------------- SCENARIO D: NET-001 PORT SCAN ----------------

def test_simulation_scenario_net_001_port_scan(client):
    """Scenario D: 16 distinct ports probed from single IP within 30s (threshold: 15 / 60s)."""
    origin_ip = "198.51.100.54"
    ports = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 1433, 3306, 3389, 8080]
    events = []
    for i, port in enumerate(ports):
        events.append({
            "event_uid": f"sim-scan-test-{port}",
            "timestamp": iso_ts(i * 1),
            "event_type": "network_connection",
            "source_ip": origin_ip,
            "destination_ip": "10.0.0.80",
            "destination_port": port,
            "host": "internal-router",
            "source": "simulation-lab",
            "severity": "info",
            "is_synthetic": True,
            "raw_event": {"test": "net-001"},
        })

    ingest_resp = client.post(INGEST_URL, json=events)
    assert ingest_resp.status_code in (200, 201)
    summary = ingest_resp.json()
    assert summary["accepted_count"] == 16

    eval_resp = client.post(EVALUATE_URL)
    assert eval_resp.status_code == 200

    alerts = client.get(ALERTS_URL).json()
    matching = [a for a in alerts["items"] if a["rule_id"] == "NET-001" and a["source_ip"] == origin_ip]
    assert len(matching) == 1
    alert = matching[0]
    assert alert["severity"] == "medium"
    assert alert["matched_count"] == 16


# ---------------- SCENARIO E: PRIV-001 PRIVILEGE ESCALATION ----------------

def test_simulation_scenario_priv_001_privilege_escalation(client):
    """Scenario E: privilege_escalation followed by process_creation and file_access."""
    priv_user = "svc_worker_e99"
    events = [
        {
            "event_uid": "sim-priv-test-1",
            "timestamp": iso_ts(0),
            "event_type": "privilege_escalation",
            "source_ip": "198.51.100.65",
            "username": priv_user,
            "host": "prod-cluster",
            "source": "simulation-lab",
            "severity": "high",
            "is_synthetic": True,
            "raw_event": {"action": "sudo su"},
        },
        {
            "event_uid": "sim-priv-test-2",
            "timestamp": iso_ts(2),
            "event_type": "process_creation",
            "source_ip": "198.51.100.65",
            "username": priv_user,
            "host": "prod-cluster",
            "source": "simulation-lab",
            "severity": "high",
            "is_synthetic": True,
            "raw_event": {"cmd": "bash"},
        },
        {
            "event_uid": "sim-priv-test-3",
            "timestamp": iso_ts(4),
            "event_type": "file_access",
            "source_ip": "198.51.100.65",
            "username": priv_user,
            "host": "prod-cluster",
            "source": "simulation-lab",
            "severity": "high",
            "is_synthetic": True,
            "raw_event": {"file": "/etc/shadow"},
        },
    ]

    ingest_resp = client.post(INGEST_URL, json=events)
    assert ingest_resp.status_code in (200, 201)
    summary = ingest_resp.json()
    assert summary["accepted_count"] == 3

    eval_resp = client.post(EVALUATE_URL)
    assert eval_resp.status_code == 200

    alerts = client.get(ALERTS_URL).json()
    matching = [a for a in alerts["items"] if a["rule_id"] == "PRIV-001" and a["username"] == priv_user]
    assert len(matching) == 1
    alert = matching[0]
    assert alert["severity"] == "high"
    assert alert["matched_count"] == 3


# ---------------- DUPLICATE AND VALIDATION HANDLING ----------------

def test_simulation_duplicate_handling(client):
    """Verifies that re-ingesting events with existing event_uids returns duplicate counts accurately."""
    event = {
        "event_uid": "sim-dup-test-unique-uid",
        "timestamp": iso_ts(0),
        "event_type": "authentication_failure",
        "source_ip": "198.51.100.77",
        "username": "user_dup",
        "source": "simulation-lab",
        "severity": "high",
        "is_synthetic": True,
    }

    # First ingest: accepted
    resp1 = client.post(INGEST_URL, json=[event])
    assert resp1.status_code in (200, 201)
    assert resp1.json()["accepted_count"] == 1
    assert resp1.json()["duplicate_count"] == 0

    # Second ingest of same event_uid: duplicate reported
    resp2 = client.post(INGEST_URL, json=[event])
    assert resp2.status_code in (200, 201, 207)
    data = resp2.json()
    assert data["duplicate_count"] == 1
    assert data["accepted_count"] == 0


def test_simulation_malformed_event_rejection(client):
    """Verifies that malformed payloads are rejected and not treated as successful."""
    malformed_event = {
        # Missing required event_uid and timestamp
        "source_ip": "invalid-ip-format-999.999.999.999",
        "event_type": "unknown_event_type",
    }
    resp = client.post(INGEST_URL, json=[malformed_event])
    # Either 422 Unprocessable Entity or 207 with rejected_count > 0
    if resp.status_code == 422:
        assert "detail" in resp.json()
    else:
        assert resp.json()["rejected_count"] > 0
        assert resp.json()["accepted_count"] == 0
