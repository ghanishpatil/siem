"""NET-001: Potential port-scan detection."""

from __future__ import annotations

from app.detection.base import (
    Detection,
    EventView,
    Rule,
    build_detection,
    mark_distinct_windows,
)
from app.normalization.vocab import NETWORK_CONNECTION


class PortScanRule(Rule):
    id = "NET-001"
    name = "Potential Port Scan"
    description = (
        "A source connecting to many distinct destination ports within a short "
        "time window."
    )
    severity = "medium"
    default_params = {"distinct_ports": 15, "window_seconds": 60}

    def evaluate(self, events: list[EventView], params: dict[str, int]) -> list[Detection]:
        threshold = params["distinct_ports"]
        window = params["window_seconds"]

        # Require a real destination port; missing ports are not port evidence.
        groups: dict[str, list[EventView]] = {}
        for event in events:
            if (
                event.event_type == NETWORK_CONNECTION
                and event.source_ip
                and event.destination_port is not None
            ):
                groups.setdefault(event.source_ip, []).append(event)

        detections: list[Detection] = []
        for source_ip in sorted(groups):
            marked = mark_distinct_windows(
                groups[source_ip], window, threshold, key=lambda e: e.destination_port
            )
            if not marked:
                continue
            ports = sorted({e.destination_port for e in marked if e.destination_port is not None})
            explanation = {
                "rule_id": self.id,
                "reason": (
                    f"{len(ports)} distinct destination ports contacted from "
                    f"{source_ip} within {window}s (threshold {threshold})."
                ),
                "threshold": threshold,
                "window_seconds": window,
                "distinct_port_count": len(ports),
                "ports": ports,
                "connection_count": len(marked),
                "source_ip": source_ip,
            }
            detections.append(
                build_detection(self, {"source_ip": source_ip}, marked, explanation)
            )
        return detections
