"""AUTH-002: Password-spraying detection."""

from __future__ import annotations

from app.detection.base import (
    Detection,
    EventView,
    Rule,
    build_detection,
    mark_distinct_windows,
)
from app.normalization.vocab import AUTH_FAILURE


class PasswordSprayRule(Rule):
    id = "AUTH-002"
    name = "Password Spraying"
    description = (
        "Authentication failures against many distinct accounts from one source "
        "IP within a time window."
    )
    severity = "high"
    default_params = {"distinct_accounts": 5, "window_seconds": 300}

    def evaluate(self, events: list[EventView], params: dict[str, int]) -> list[Detection]:
        threshold = params["distinct_accounts"]
        window = params["window_seconds"]

        # Only real authentication failures with a known account count.
        groups: dict[str, list[EventView]] = {}
        for event in events:
            if event.event_type == AUTH_FAILURE and event.source_ip and event.username:
                groups.setdefault(event.source_ip, []).append(event)

        detections: list[Detection] = []
        for source_ip in sorted(groups):
            marked = mark_distinct_windows(
                groups[source_ip], window, threshold, key=lambda e: e.username
            )
            if not marked:
                continue
            accounts = sorted({e.username for e in marked if e.username})
            explanation = {
                "rule_id": self.id,
                "reason": (
                    f"Failures against {len(accounts)} distinct accounts from "
                    f"{source_ip} within {window}s (threshold {threshold})."
                ),
                "threshold": threshold,
                "window_seconds": window,
                "distinct_account_count": len(accounts),
                "accounts": accounts,
                "failure_count": len(marked),
                "source_ip": source_ip,
            }
            detections.append(
                build_detection(self, {"source_ip": source_ip}, marked, explanation)
            )
        return detections
