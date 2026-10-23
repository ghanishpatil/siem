"""Core types and helpers shared by all detection rules.

Rules operate on lightweight ``EventView`` objects (not ORM rows) so they are
pure and independently testable. A rule returns zero or more ``Detection``
objects, each carrying the evidence event ids, a stable fingerprint, and a
structured explanation.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Optional


@dataclass(frozen=True)
class EventView:
    """Read-only projection of a persisted event used during correlation."""

    id: int
    event_uid: str
    timestamp: datetime  # naive, represents UTC
    event_type: str
    severity: str
    is_synthetic: bool
    source_ip: Optional[str] = None
    destination_ip: Optional[str] = None
    destination_port: Optional[int] = None
    username: Optional[str] = None
    host: Optional[str] = None


@dataclass
class Detection:
    """A single rule match, ready to be upserted into an alert."""

    rule_id: str
    rule_name: str
    severity: str
    description: str
    event_ids: list[int]
    first_observed: datetime
    last_observed: datetime
    matched_count: int
    explanation: dict[str, Any]
    is_synthetic: bool
    source_ip: Optional[str] = None
    username: Optional[str] = None
    host: Optional[str] = None
    fingerprint: str = ""


@dataclass
class RuleRuntimeConfig:
    """Effective configuration for a rule during one evaluation."""

    enabled: bool
    params: dict[str, int] = field(default_factory=dict)


class Rule:
    """Base class for detection rules. Subclasses set metadata and implement
    ``evaluate``."""

    id: str = ""
    name: str = ""
    description: str = ""
    severity: str = "medium"
    default_enabled: bool = True
    default_params: dict[str, int] = {}

    def evaluate(
        self, events: list[EventView], params: dict[str, int]
    ) -> list[Detection]:  # pragma: no cover - interface
        raise NotImplementedError


def make_fingerprint(rule_id: str, entities: dict[str, Optional[str]]) -> str:
    """Stable dedup key from the rule id and its correlation entities."""
    parts = [rule_id] + [f"{key}={entities[key]}" for key in sorted(entities)]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def build_detection(
    rule: Rule,
    entities: dict[str, Optional[str]],
    evidence: list[EventView],
    explanation: dict[str, Any],
) -> Detection:
    """Assemble a Detection from evidence events deterministically."""
    ordered = sorted(evidence, key=lambda e: (e.timestamp, e.id))
    event_ids = sorted({e.id for e in ordered})
    timestamps = [e.timestamp for e in ordered]
    host = entities.get("host") or next((e.host for e in ordered if e.host), None)
    return Detection(
        rule_id=rule.id,
        rule_name=rule.name,
        severity=rule.severity,
        description=rule.description,
        event_ids=event_ids,
        first_observed=min(timestamps),
        last_observed=max(timestamps),
        matched_count=len(event_ids),
        explanation=explanation,
        is_synthetic=all(e.is_synthetic for e in ordered),
        source_ip=entities.get("source_ip"),
        username=entities.get("username"),
        host=host,
        fingerprint=make_fingerprint(rule.id, entities),
    )


def mark_count_windows(
    events: list[EventView], window_seconds: int, threshold: int
) -> list[EventView]:
    """Return events that participate in any sliding window of ``window_seconds``
    containing at least ``threshold`` events. Input must be time-sorted."""
    if threshold <= 0 or not events:
        return []
    window = timedelta(seconds=window_seconds)
    marked: set[int] = set()
    left = 0
    for right in range(len(events)):
        while events[right].timestamp - events[left].timestamp > window:
            left += 1
        if right - left + 1 >= threshold:
            marked.update(range(left, right + 1))
    return [events[i] for i in sorted(marked)]


def mark_distinct_windows(
    events: list[EventView],
    window_seconds: int,
    threshold: int,
    key: Callable[[EventView], Any],
) -> list[EventView]:
    """Return events that participate in any sliding window of ``window_seconds``
    containing at least ``threshold`` distinct ``key`` values. Input must be
    time-sorted and every event must have a non-null key."""
    if threshold <= 0 or not events:
        return []
    window = timedelta(seconds=window_seconds)
    marked: set[int] = set()
    counts: dict[Any, int] = {}
    left = 0
    for right in range(len(events)):
        key_right = key(events[right])
        counts[key_right] = counts.get(key_right, 0) + 1
        while events[right].timestamp - events[left].timestamp > window:
            key_left = key(events[left])
            counts[key_left] -= 1
            if counts[key_left] == 0:
                del counts[key_left]
            left += 1
        if len(counts) >= threshold:
            marked.update(range(left, right + 1))
    return [events[i] for i in sorted(marked)]
