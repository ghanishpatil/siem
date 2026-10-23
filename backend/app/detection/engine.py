"""Deterministic correlation engine.

Pure function over a list of events and a rule configuration. Events are sorted
by (timestamp, id) once so that rules see a consistent, out-of-order-safe
ordering, and detections are returned in a stable order.
"""

from __future__ import annotations

from app.detection.base import Detection, EventView, RuleRuntimeConfig
from app.detection.rules import RULES


def evaluate(
    events: list[EventView], configs: dict[str, RuleRuntimeConfig]
) -> list[Detection]:
    """Run all enabled rules over the events and return detections."""
    ordered = sorted(events, key=lambda e: (e.timestamp, e.id))

    detections: list[Detection] = []
    for rule in RULES:
        config = configs.get(rule.id)
        if config is None or not config.enabled:
            continue
        params = {**rule.default_params, **(config.params or {})}
        detections.extend(rule.evaluate(ordered, params))

    detections.sort(key=lambda d: (d.rule_id, d.fingerprint))
    return detections
