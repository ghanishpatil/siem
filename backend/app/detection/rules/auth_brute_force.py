"""AUTH-001: Brute-force authentication detection."""

from __future__ import annotations

from app.detection.base import (
    Detection,
    EventView,
    Rule,
    build_detection,
    mark_count_windows,
)
from app.normalization.vocab import AUTH_FAILURE


class BruteForceRule(Rule):
    id = "AUTH-001"
    name = "Brute Force Authentication"
    description = (
        "Many authentication failures from a single source IP within a short "
        "time window."
    )
    severity = "high"
    default_params = {"threshold": 10, "window_seconds": 60}

    def evaluate(self, events: list[EventView], params: dict[str, int]) -> list[Detection]:
        threshold = params["threshold"]
        window = params["window_seconds"]

        groups: dict[str, list[EventView]] = {}
        for event in events:
            if event.event_type == AUTH_FAILURE and event.source_ip:
                groups.setdefault(event.source_ip, []).append(event)

        detections: list[Detection] = []
        for source_ip in sorted(groups):
            marked = mark_count_windows(groups[source_ip], window, threshold)
            if not marked:
                continue
            explanation = {
                "rule_id": self.id,
                "reason": (
                    f"{len(marked)} authentication failures from {source_ip} "
                    f"within {window}s (threshold {threshold})."
                ),
                "threshold": threshold,
                "window_seconds": window,
                "failure_count": len(marked),
                "source_ip": source_ip,
            }
            detections.append(
                build_detection(self, {"source_ip": source_ip}, marked, explanation)
            )
        return detections
