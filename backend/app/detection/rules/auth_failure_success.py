"""AUTH-003: Repeated failures followed by a successful authentication."""

from __future__ import annotations

from datetime import timedelta

from app.detection.base import Detection, EventView, Rule, build_detection
from app.normalization.vocab import AUTH_FAILURE, AUTH_SUCCESS


class FailureThenSuccessRule(Rule):
    id = "AUTH-003"
    name = "Failed Logins Followed by Success"
    description = (
        "A successful authentication preceded by repeated failures for the same "
        "account and source IP within a time window."
    )
    severity = "critical"
    default_params = {"min_failures": 5, "window_seconds": 300}

    def evaluate(self, events: list[EventView], params: dict[str, int]) -> list[Detection]:
        min_failures = params["min_failures"]
        window = timedelta(seconds=params["window_seconds"])

        # Correlate only when both source IP and account are present.
        groups: dict[tuple[str, str], list[EventView]] = {}
        for event in events:
            if (
                event.event_type in (AUTH_FAILURE, AUTH_SUCCESS)
                and event.source_ip
                and event.username
            ):
                groups.setdefault((event.source_ip, event.username), []).append(event)

        detections: list[Detection] = []
        for (source_ip, username) in sorted(groups):
            group = groups[(source_ip, username)]  # already time-sorted by the engine
            for success in group:
                if success.event_type != AUTH_SUCCESS:
                    continue
                preceding = [
                    e
                    for e in group
                    if e.event_type == AUTH_FAILURE
                    and e.timestamp < success.timestamp
                    and (success.timestamp - e.timestamp) <= window
                ]
                if len(preceding) >= min_failures:
                    evidence = preceding + [success]
                    explanation = {
                        "rule_id": self.id,
                        "reason": (
                            f"{len(preceding)} failures for {username} from "
                            f"{source_ip} within {params['window_seconds']}s before a "
                            f"successful login (threshold {min_failures})."
                        ),
                        "threshold": min_failures,
                        "window_seconds": params["window_seconds"],
                        "failure_count": len(preceding),
                        "source_ip": source_ip,
                        "username": username,
                        "success_event_id": success.id,
                    }
                    detections.append(
                        build_detection(
                            self,
                            {"source_ip": source_ip, "username": username},
                            evidence,
                            explanation,
                        )
                    )
                    break  # one detection per (source_ip, account)
        return detections
