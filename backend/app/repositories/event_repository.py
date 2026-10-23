"""Data-access layer for events.

All event database reads and writes live here so that API routes stay free of
query logic. Writes are transactional: they commit on success and roll back on
failure.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.normalization.normalizer import NormalizedEvent


def existing_uids(db: Session, uids: list[str]) -> set[str]:
    """Return the subset of ``uids`` already present in the database."""
    if not uids:
        return set()
    rows = db.execute(
        select(Event.event_uid).where(Event.event_uid.in_(uids))
    ).scalars().all()
    return set(rows)


def add_events(db: Session, normalized: list[NormalizedEvent]) -> list[tuple[int, str]]:
    """Insert normalized events in a single transaction.

    Returns a list of ``(id, event_uid)`` in the same order as the input.
    Commits on success; rolls back and re-raises on any error.
    """
    if not normalized:
        return []

    events = [
        Event(
            event_uid=n.event_uid,
            timestamp=n.timestamp,
            event_type=n.event_type,
            severity=n.severity,
            source=n.source,
            is_synthetic=n.is_synthetic,
            source_ip=n.source_ip,
            destination_ip=n.destination_ip,
            destination_port=n.destination_port,
            username=n.username,
            host=n.host,
            raw_event=n.raw_event,
        )
        for n in normalized
    ]

    try:
        db.add_all(events)
        db.flush()  # assign primary keys
        # Capture ids/uids before commit expires the instances.
        result = [(event.id, event.event_uid) for event in events]
        db.commit()
    except Exception:
        db.rollback()
        raise
    return result


def list_events(
    db: Session,
    *,
    limit: int,
    offset: int,
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    source_ip: Optional[str] = None,
) -> tuple[list[Event], int]:
    """Return a filtered, deterministically ordered page of events and the
    total number of events matching the filters."""
    conditions = []
    if event_type:
        conditions.append(Event.event_type == event_type)
    if severity:
        conditions.append(Event.severity == severity)
    if source_ip:
        conditions.append(Event.source_ip == source_ip)

    count_stmt = select(func.count()).select_from(Event)
    items_stmt = select(Event)
    if conditions:
        count_stmt = count_stmt.where(*conditions)
        items_stmt = items_stmt.where(*conditions)

    total = db.execute(count_stmt).scalar_one()
    # Deterministic ordering: newest first, id as a stable tiebreaker.
    items_stmt = (
        items_stmt.order_by(Event.timestamp.desc(), Event.id.desc())
        .limit(limit)
        .offset(offset)
    )
    items = list(db.execute(items_stmt).scalars().all())
    return items, total


def get_event(db: Session, event_id: int) -> Optional[Event]:
    """Return a single event by primary key, or None."""
    return db.get(Event, event_id)


def get_stats(db: Session, recent_window_hours: int) -> dict:
    """Compute statistics from actual stored rows."""
    total = db.execute(select(func.count()).select_from(Event)).scalar_one()

    by_event_type = {
        event_type: count
        for event_type, count in db.execute(
            select(Event.event_type, func.count()).group_by(Event.event_type)
        ).all()
    }
    by_severity = {
        severity: count
        for severity, count in db.execute(
            select(Event.severity, func.count()).group_by(Event.severity)
        ).all()
    }

    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        hours=recent_window_hours
    )
    recent = db.execute(
        select(func.count()).select_from(Event).where(Event.timestamp >= cutoff)
    ).scalar_one()

    # Synthetic vs real provenance counts (keeps demo data distinguishable).
    provenance = {
        bool(is_synthetic): count
        for is_synthetic, count in db.execute(
            select(Event.is_synthetic, func.count()).group_by(Event.is_synthetic)
        ).all()
    }

    return {
        "total_events": total,
        "by_event_type": by_event_type,
        "by_severity": by_severity,
        "recent_event_count": recent,
        "recent_window_hours": recent_window_hours,
        "synthetic_count": provenance.get(True, 0),
        "real_count": provenance.get(False, 0),
    }


def get_events_by_ids(db: Session, event_ids: list[int]) -> list[Event]:
    """Return stored events for the given ids, ordered by id."""
    if not event_ids:
        return []
    stmt = select(Event).where(Event.id.in_(event_ids)).order_by(Event.id.asc())
    return list(db.execute(stmt).scalars().all())


def fetch_for_detection(db: Session, limit: int) -> list[Event]:
    """Return events ordered by (timestamp, id) for correlation, bounded by
    ``limit`` to keep a local evaluation from loading an unbounded set."""
    stmt = (
        select(Event)
        .order_by(Event.timestamp.asc(), Event.id.asc())
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())
