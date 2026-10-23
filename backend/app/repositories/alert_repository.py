"""Data-access layer for alerts.

Encapsulates fingerprint-based upsert (deduplication), listing, retrieval,
status updates, and statistics. Upserts flush but do not commit; the caller
owns the transaction so a whole evaluation can be committed or rolled back
atomically. Status updates are standalone and commit themselves.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.detection.base import Detection
from app.models.alert import Alert

ALLOWED_STATUSES = frozenset(
    {"open", "acknowledged", "investigating", "resolved", "false_positive", "closed"}
)


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_by_fingerprint(db: Session, fingerprint: str) -> Optional[Alert]:
    return db.execute(
        select(Alert).where(Alert.fingerprint == fingerprint)
    ).scalar_one_or_none()


def upsert_alert(db: Session, detection: Detection) -> tuple[Alert, str]:
    """Insert a new alert or update an existing one sharing the fingerprint.

    Returns ``(alert, state)`` where state is ``created``, ``updated``, or
    ``unchanged``. Investigation status and ``created_at`` are preserved across
    updates; evidence and detection fields are refreshed.
    """
    existing = get_by_fingerprint(db, detection.fingerprint)
    now = _utcnow_naive()

    if existing is None:
        alert = Alert(
            fingerprint=detection.fingerprint,
            rule_id=detection.rule_id,
            rule_name=detection.rule_name,
            severity=detection.severity,
            description=detection.description,
            status="open",
            source_ip=detection.source_ip,
            username=detection.username,
            host=detection.host,
            matched_count=detection.matched_count,
            evidence_event_ids=list(detection.event_ids),
            explanation=detection.explanation,
            is_synthetic=detection.is_synthetic,
            first_observed=detection.first_observed,
            last_observed=detection.last_observed,
            detected_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(alert)
        db.flush()
        return alert, "created"

    new_first = min(existing.first_observed, detection.first_observed)
    new_last = max(existing.last_observed, detection.last_observed)
    changed = (
        existing.matched_count != detection.matched_count
        or sorted(existing.evidence_event_ids or []) != sorted(detection.event_ids)
        or existing.severity != detection.severity
        or existing.explanation != detection.explanation
        or existing.first_observed != new_first
        or existing.last_observed != new_last
    )
    if not changed:
        return existing, "unchanged"

    existing.matched_count = detection.matched_count
    existing.evidence_event_ids = list(detection.event_ids)
    existing.explanation = detection.explanation
    existing.severity = detection.severity
    existing.description = detection.description
    existing.first_observed = new_first
    existing.last_observed = new_last
    existing.detected_at = now
    existing.updated_at = now
    db.flush()
    return existing, "updated"


def list_alerts(
    db: Session,
    *,
    limit: int,
    offset: int,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    rule_id: Optional[str] = None,
) -> tuple[list[Alert], int]:
    conditions = []
    if severity:
        conditions.append(Alert.severity == severity)
    if status:
        conditions.append(Alert.status == status)
    if rule_id:
        conditions.append(Alert.rule_id == rule_id)

    count_stmt = select(func.count()).select_from(Alert)
    items_stmt = select(Alert)
    if conditions:
        count_stmt = count_stmt.where(*conditions)
        items_stmt = items_stmt.where(*conditions)

    total = db.execute(count_stmt).scalar_one()
    items_stmt = (
        items_stmt.order_by(Alert.detected_at.desc(), Alert.id.desc())
        .limit(limit)
        .offset(offset)
    )
    items = list(db.execute(items_stmt).scalars().all())
    return items, total


def get_alert(db: Session, alert_id: int) -> Optional[Alert]:
    return db.get(Alert, alert_id)


def update_status(db: Session, alert_id: int, status: str) -> Optional[Alert]:
    """Update only the investigation status; evidence/detection are preserved."""
    alert = db.get(Alert, alert_id)
    if alert is None:
        return None
    try:
        alert.status = status
        alert.updated_at = _utcnow_naive()
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(alert)
    return alert


def get_stats(db: Session) -> dict:
    total = db.execute(select(func.count()).select_from(Alert)).scalar_one()
    by_severity = {
        severity: count
        for severity, count in db.execute(
            select(Alert.severity, func.count()).group_by(Alert.severity)
        ).all()
    }
    by_status = {
        status: count
        for status, count in db.execute(
            select(Alert.status, func.count()).group_by(Alert.status)
        ).all()
    }
    by_rule = {
        rule_id: count
        for rule_id, count in db.execute(
            select(Alert.rule_id, func.count()).group_by(Alert.rule_id)
        ).all()
    }
    return {
        "total_alerts": total,
        "by_severity": by_severity,
        "by_status": by_status,
        "by_rule": by_rule,
    }
