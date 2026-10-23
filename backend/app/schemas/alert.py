"""Pydantic schemas for the alerts API."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.event import EventResponse


class AlertStatus(str, Enum):
    open = "open"
    acknowledged = "acknowledged"
    investigating = "investigating"
    resolved = "resolved"
    false_positive = "false_positive"
    closed = "closed"


class RuleOverride(BaseModel):
    """Optional per-rule override for an evaluation. Only enabled flags and
    positive integer thresholds are accepted (no code execution)."""

    model_config = ConfigDict(extra="forbid")

    enabled: Optional[bool] = None
    params: Optional[dict[str, int]] = None

    @field_validator("params")
    @classmethod
    def _positive_params(cls, value: Optional[dict[str, int]]) -> Optional[dict[str, int]]:
        if value is None:
            return None
        for key, val in value.items():
            if not isinstance(val, int) or isinstance(val, bool) or val < 1:
                raise ValueError(f"param '{key}' must be a positive integer")
        return value


class EvaluateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rules: Optional[dict[str, RuleOverride]] = None


class EvaluatedAlertRef(BaseModel):
    id: int
    fingerprint: str
    rule_id: str
    state: str  # created | updated | unchanged


class CorrelationSourceNode(BaseModel):
    """An event source entity (IP/username) participating in correlation."""
    entity_type: str  # "source_ip" | "username"
    entity_value: str
    event_count: int
    event_types: list[str]


class CorrelationRuleNode(BaseModel):
    """A detection rule that matched during correlation."""
    rule_id: str
    rule_name: str
    severity: str
    matched_event_count: int
    source_entities: list[str]
    alert_ids: list[int]


class CorrelationEdge(BaseModel):
    """An edge in the correlation flow graph."""
    source: str  # source entity label or rule_id
    target: str  # rule_id or alert label
    weight: int  # event count flowing through this edge
    edge_type: str  # "event_to_rule" | "rule_to_alert"


class CorrelationMap(BaseModel):
    """Full correlation graph data for visualization."""
    source_nodes: list[CorrelationSourceNode]
    rule_nodes: list[CorrelationRuleNode]
    alert_nodes: list[EvaluatedAlertRef]
    edges: list[CorrelationEdge]


class EvaluateSummary(BaseModel):
    events_evaluated: int
    rules_enabled: list[str]
    detections: int
    alerts_created: int
    alerts_updated: int
    alerts_unchanged: int
    alerts: list[EvaluatedAlertRef]
    correlation_map: Optional[CorrelationMap] = None


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fingerprint: str
    rule_id: str
    rule_name: str
    severity: str
    description: str
    status: str
    source_ip: Optional[str]
    username: Optional[str]
    host: Optional[str]
    matched_count: int
    evidence_event_ids: list[int]
    explanation: dict[str, Any]
    is_synthetic: bool
    first_observed: datetime
    last_observed: datetime
    detected_at: datetime
    created_at: datetime
    updated_at: datetime


class AlertDetailResponse(AlertResponse):
    evidence: list[EventResponse]


class AlertListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[AlertResponse]


class AlertStatsResponse(BaseModel):
    total_alerts: int
    by_severity: dict[str, int]
    by_status: dict[str, int]
    by_rule: dict[str, int]


class PatchAlertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: AlertStatus


class RuleInfo(BaseModel):
    id: str
    name: str
    description: str
    severity: str
    enabled: bool
    params: dict[str, int]
