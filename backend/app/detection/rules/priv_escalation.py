"""PRIV-001: Suspicious privilege-escalation sequence detection."""

from __future__ import annotations

from datetime import timedelta

from app.detection.base import Detection, EventView, Rule, build_detection
from app.normalization.vocab import PRIVILEGE_ESCALATION, SENSITIVE_ACTION_TYPES


class PrivilegeEscalationRule(Rule):
    id = "PRIV-001"
    name = "Suspicious Privilege Escalation"
    description = (
        "A privilege-escalation event followed by a sensitive action (file "
        "access or process creation) by the same account within a time window."
    )
    severity = "high"
    default_params = {"window_seconds": 300}

    def evaluate(self, events: list[EventView], params: dict[str, int]) -> list[Detection]:
        window = timedelta(seconds=params["window_seconds"])

        # Require an account; only genuine privilege-escalation and sensitive
        # action events are considered (never generic/unknown events).
        groups: dict[str, list[EventView]] = {}
        for event in events:
            if event.username and (
                event.event_type == PRIVILEGE_ESCALATION
                or event.event_type in SENSITIVE_ACTION_TYPES
            ):
                groups.setdefault(event.username, []).append(event)

        detections: list[Detection] = []
        for username in sorted(groups):
            group = groups[username]  # already time-sorted by the engine
            for priv in group:
                if priv.event_type != PRIVILEGE_ESCALATION:
                    continue
                following = [
                    e
                    for e in group
                    if e.event_type in SENSITIVE_ACTION_TYPES
                    and e.timestamp > priv.timestamp
                    and (e.timestamp - priv.timestamp) <= window
                ]
                if following:
                    evidence = [priv] + following
                    action_types = sorted({e.event_type for e in following})
                    explanation = {
                        "rule_id": self.id,
                        "reason": (
                            f"Privilege escalation for {username} followed by "
                            f"{len(following)} sensitive action(s) within "
                            f"{params['window_seconds']}s."
                        ),
                        "window_seconds": params["window_seconds"],
                        "privilege_event_id": priv.id,
                        "sensitive_action_count": len(following),
                        "sensitive_action_types": action_types,
                        "username": username,
                    }
                    detections.append(
                        build_detection(self, {"username": username}, evidence, explanation)
                    )
                    break  # one detection per account
        return detections
