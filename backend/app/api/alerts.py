"""Alert evaluation, retrieval, status management, and statistics endpoints.

Routes are thin: detection logic lives in ``app.detection`` and persistence in
``app.repositories.alert_repository``. There is no endpoint that executes
arbitrary code; evaluation overrides are limited to validated enable flags and
positive integer thresholds.
"""

from __future__ import annotations

from datetime import timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.events import to_event_response
from app.db.session import get_db
from app.detection import service
from app.detection.service import UnknownRuleError
from app.models.alert import Alert
from app.repositories import alert_repository, event_repository
from app.schemas.alert import (
    AlertDetailResponse,
    AlertListResponse,
    AlertResponse,
    AlertStatsResponse,
    EvaluateRequest,
    EvaluateSummary,
    PatchAlertRequest,
    RuleInfo,
)

router = APIRouter(prefix="/alerts", tags=["alerts"])


def to_alert_response(alert: Alert) -> AlertResponse:
    """Map an ORM Alert to its API representation with UTC-aware timestamps."""
    return AlertResponse(
        id=alert.id,
        fingerprint=alert.fingerprint,
        rule_id=alert.rule_id,
        rule_name=alert.rule_name,
        severity=alert.severity,
        description=alert.description,
        status=alert.status,
        source_ip=alert.source_ip,
        username=alert.username,
        host=alert.host,
        matched_count=alert.matched_count,
        evidence_event_ids=list(alert.evidence_event_ids or []),
        explanation=alert.explanation or {},
        is_synthetic=alert.is_synthetic,
        first_observed=alert.first_observed.replace(tzinfo=timezone.utc),
        last_observed=alert.last_observed.replace(tzinfo=timezone.utc),
        detected_at=alert.detected_at.replace(tzinfo=timezone.utc),
        created_at=alert.created_at.replace(tzinfo=timezone.utc),
        updated_at=alert.updated_at.replace(tzinfo=timezone.utc),
    )


@router.post("/evaluate", response_model=EvaluateSummary)
def evaluate_alerts(
    payload: Optional[EvaluateRequest] = None, db: Session = Depends(get_db)
) -> EvaluateSummary:
    """Evaluate persisted events against enabled rules and persist alerts."""
    overrides = None
    if payload and payload.rules:
        overrides = {rule_id: ov.model_dump() for rule_id, ov in payload.rules.items()}
    try:
        summary = service.evaluate_and_persist(db, overrides)
    except UnknownRuleError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="internal error during evaluation")
    return EvaluateSummary(**summary)


@router.get("/rules", response_model=list[RuleInfo])
def list_rules() -> list[RuleInfo]:
    """Read-only listing of active rules with effective thresholds."""
    return [RuleInfo(**rule) for rule in service.active_rules()]


@router.get("/stats", response_model=AlertStatsResponse)
def alert_stats(db: Session = Depends(get_db)) -> AlertStatsResponse:
    """Alert counts and breakdowns computed from persisted rows."""
    return AlertStatsResponse(**alert_repository.get_stats(db))


@router.get("", response_model=AlertListResponse)
def list_alerts(
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    severity: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    rule_id: Optional[str] = Query(default=None),
) -> AlertListResponse:
    """List alerts with bounded pagination, filters, and deterministic order."""
    items, total = alert_repository.list_alerts(
        db,
        limit=limit,
        offset=offset,
        severity=severity,
        status=status,
        rule_id=rule_id,
    )
    return AlertListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[to_alert_response(a) for a in items],
    )


@router.get("/{alert_id}", response_model=AlertDetailResponse)
def get_alert(alert_id: int, db: Session = Depends(get_db)) -> AlertDetailResponse:
    """Return an alert and its resolved evidence events, or 404."""
    alert = alert_repository.get_alert(db, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="alert not found")

    evidence_events = event_repository.get_events_by_ids(
        db, list(alert.evidence_event_ids or [])
    )
    base = to_alert_response(alert)
    return AlertDetailResponse(
        **base.model_dump(),
        evidence=[to_event_response(e) for e in evidence_events],
    )


@router.patch("/{alert_id}", response_model=AlertResponse)
def patch_alert(
    alert_id: int, payload: PatchAlertRequest, db: Session = Depends(get_db)
) -> AlertResponse:
    """Change an alert's investigation status (allowed values validated)."""
    alert = alert_repository.update_status(db, alert_id, payload.status.value)
    if alert is None:
        raise HTTPException(status_code=404, detail="alert not found")
    return to_alert_response(alert)
