"""Unit tests for the five detection rules and the engine.

Rules are tested directly on EventView lists (no database), which keeps them
fast and isolated. Covers the required positive and negative cases.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.detection.base import EventView, RuleRuntimeConfig
from app.detection.engine import evaluate as engine_evaluate
from app.detection.rules import default_configs
from app.detection.rules.auth_brute_force import BruteForceRule
from app.detection.rules.auth_failure_success import FailureThenSuccessRule
from app.detection.rules.auth_password_spray import PasswordSprayRule
from app.detection.rules.net_port_scan import PortScanRule
from app.detection.rules.priv_escalation import PrivilegeEscalationRule
from app.normalization.vocab import (
    AUTH_FAILURE,
    AUTH_SUCCESS,
    FILE_ACCESS,
    NETWORK_CONNECTION,
    PRIVILEGE_ESCALATION,
)

BASE = datetime(2026, 10, 16, 9, 0, 0)


def ev(event_id, event_type, offset_s=0, **kw):
    return EventView(
        id=event_id,
        event_uid=f"u{event_id}",
        timestamp=BASE + timedelta(seconds=offset_s),
        event_type=event_type,
        severity=kw.get("severity", "info"),
        is_synthetic=kw.get("is_synthetic", True),
        source_ip=kw.get("source_ip"),
        destination_ip=kw.get("destination_ip"),
        destination_port=kw.get("destination_port"),
        username=kw.get("username"),
        host=kw.get("host"),
    )


def _sorted(events):
    return sorted(events, key=lambda e: (e.timestamp, e.id))


# ---------------- AUTH-001 brute force ----------------

def test_brute_force_positive():
    rule = BruteForceRule()
    events = [ev(i, AUTH_FAILURE, offset_s=i, source_ip="10.0.0.1") for i in range(10)]
    detections = rule.evaluate(_sorted(events), {"threshold": 10, "window_seconds": 60})
    assert len(detections) == 1
    det = detections[0]
    assert det.rule_id == "AUTH-001"
    assert det.severity == "high"
    assert det.source_ip == "10.0.0.1"
    assert len(det.event_ids) == 10
    assert det.explanation["failure_count"] == 10


def test_brute_force_below_threshold():
    rule = BruteForceRule()
    events = [ev(i, AUTH_FAILURE, offset_s=i, source_ip="10.0.0.1") for i in range(9)]
    assert rule.evaluate(_sorted(events), {"threshold": 10, "window_seconds": 60}) == []


def test_brute_force_beyond_window():
    rule = BruteForceRule()
    events = [ev(i, AUTH_FAILURE, offset_s=i * 70, source_ip="10.0.0.1") for i in range(10)]
    assert rule.evaluate(_sorted(events), {"threshold": 10, "window_seconds": 60}) == []


def test_brute_force_different_sources_not_combined():
    rule = BruteForceRule()
    events = [ev(i, AUTH_FAILURE, offset_s=i, source_ip=f"10.0.0.{i}") for i in range(10)]
    assert rule.evaluate(_sorted(events), {"threshold": 10, "window_seconds": 60}) == []


def test_brute_force_missing_source_ip_safe():
    rule = BruteForceRule()
    events = [ev(i, AUTH_FAILURE, offset_s=i, source_ip=None) for i in range(10)]
    assert rule.evaluate(_sorted(events), {"threshold": 10, "window_seconds": 60}) == []


# ---------------- AUTH-002 password spraying ----------------

def test_password_spray_positive():
    rule = PasswordSprayRule()
    events = [
        ev(i, AUTH_FAILURE, offset_s=i, source_ip="10.0.0.2", username=f"user{i}")
        for i in range(5)
    ]
    detections = rule.evaluate(_sorted(events), {"distinct_accounts": 5, "window_seconds": 300})
    assert len(detections) == 1
    assert detections[0].explanation["distinct_account_count"] == 5


def test_password_spray_single_account_negative():
    rule = PasswordSprayRule()
    events = [
        ev(i, AUTH_FAILURE, offset_s=i, source_ip="10.0.0.2", username="alice")
        for i in range(20)
    ]
    assert rule.evaluate(_sorted(events), {"distinct_accounts": 5, "window_seconds": 300}) == []


# ---------------- AUTH-003 failures then success ----------------

def test_failures_then_success_positive():
    rule = FailureThenSuccessRule()
    events = [ev(i, AUTH_FAILURE, offset_s=i, source_ip="10.0.0.3", username="bob") for i in range(5)]
    events.append(ev(100, AUTH_SUCCESS, offset_s=10, source_ip="10.0.0.3", username="bob"))
    detections = rule.evaluate(_sorted(events), {"min_failures": 5, "window_seconds": 300})
    assert len(detections) == 1
    assert detections[0].severity == "critical"
    assert detections[0].explanation["failure_count"] == 5
    assert len(detections[0].event_ids) == 6


def test_success_before_failures_negative():
    rule = FailureThenSuccessRule()
    events = [ev(100, AUTH_SUCCESS, offset_s=0, source_ip="10.0.0.3", username="bob")]
    events += [ev(i, AUTH_FAILURE, offset_s=i + 1, source_ip="10.0.0.3", username="bob") for i in range(5)]
    assert rule.evaluate(_sorted(events), {"min_failures": 5, "window_seconds": 300}) == []


def test_failures_then_success_missing_fields_negative():
    rule = FailureThenSuccessRule()
    events = [ev(i, AUTH_FAILURE, offset_s=i, source_ip="10.0.0.3", username=None) for i in range(5)]
    events.append(ev(100, AUTH_SUCCESS, offset_s=10, source_ip="10.0.0.3", username=None))
    assert rule.evaluate(_sorted(events), {"min_failures": 5, "window_seconds": 300}) == []


# ---------------- NET-001 port scan ----------------

def test_port_scan_positive():
    rule = PortScanRule()
    events = [
        ev(i, NETWORK_CONNECTION, offset_s=i, source_ip="10.0.0.4", destination_port=1000 + i)
        for i in range(15)
    ]
    detections = rule.evaluate(_sorted(events), {"distinct_ports": 15, "window_seconds": 60})
    assert len(detections) == 1
    assert detections[0].explanation["distinct_port_count"] == 15


def test_port_scan_missing_ports_negative():
    rule = PortScanRule()
    events = [
        ev(i, NETWORK_CONNECTION, offset_s=i, source_ip="10.0.0.4", destination_port=None)
        for i in range(20)
    ]
    assert rule.evaluate(_sorted(events), {"distinct_ports": 15, "window_seconds": 60}) == []


# ---------------- PRIV-001 privilege escalation ----------------

def test_privilege_escalation_positive():
    rule = PrivilegeEscalationRule()
    events = [
        ev(1, PRIVILEGE_ESCALATION, offset_s=0, username="carol"),
        ev(2, FILE_ACCESS, offset_s=5, username="carol"),
    ]
    detections = rule.evaluate(_sorted(events), {"window_seconds": 300})
    assert len(detections) == 1
    assert detections[0].explanation["sensitive_action_count"] == 1
    assert len(detections[0].event_ids) == 2


def test_privilege_escalation_wrong_sequence_negative():
    rule = PrivilegeEscalationRule()
    events = [
        ev(1, FILE_ACCESS, offset_s=0, username="carol"),
        ev(2, PRIVILEGE_ESCALATION, offset_s=5, username="carol"),
    ]
    assert rule.evaluate(_sorted(events), {"window_seconds": 300}) == []


def test_privilege_escalation_generic_event_negative():
    rule = PrivilegeEscalationRule()
    events = [
        ev(1, "unknown", offset_s=0, username="carol"),
        ev(2, FILE_ACCESS, offset_s=5, username="carol"),
    ]
    assert rule.evaluate(_sorted(events), {"window_seconds": 300}) == []


# ---------------- engine: ordering, determinism, disabled ----------------

def test_engine_handles_out_of_order_and_is_deterministic():
    events = [ev(i, AUTH_FAILURE, offset_s=i, source_ip="10.0.0.1") for i in range(10)]
    shuffled = list(reversed(events))
    configs = default_configs()
    first = engine_evaluate(shuffled, configs)
    second = engine_evaluate(events, configs)
    assert [d.fingerprint for d in first] == [d.fingerprint for d in second]
    auth = [d for d in first if d.rule_id == "AUTH-001"]
    assert len(auth) == 1
    # Evidence ids are sorted ascending regardless of input order.
    assert auth[0].event_ids == sorted(auth[0].event_ids)


def test_engine_respects_disabled_rule():
    events = [ev(i, AUTH_FAILURE, offset_s=i, source_ip="10.0.0.1") for i in range(10)]
    configs = default_configs()
    configs["AUTH-001"] = RuleRuntimeConfig(enabled=False, params=configs["AUTH-001"].params)
    detections = engine_evaluate(events, configs)
    assert all(d.rule_id != "AUTH-001" for d in detections)


def test_synthetic_provenance_reflects_evidence():
    rule = BruteForceRule()
    events = [ev(i, AUTH_FAILURE, offset_s=i, source_ip="10.0.0.1", is_synthetic=True) for i in range(10)]
    assert rule.evaluate(_sorted(events), {"threshold": 10, "window_seconds": 60})[0].is_synthetic is True
    events[0] = ev(0, AUTH_FAILURE, offset_s=0, source_ip="10.0.0.1", is_synthetic=False)
    assert rule.evaluate(_sorted(events), {"threshold": 10, "window_seconds": 60})[0].is_synthetic is False
