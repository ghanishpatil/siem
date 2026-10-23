"""SQLAlchemy ORM model for a persisted, explainable alert.

Evidence is stored structurally: ``evidence_event_ids`` is a JSON array of the
event primary keys that triggered the alert, and ``explanation`` is a JSON
object with the rule's counts, window, entities, and thresholds. Timestamps are
stored as naive UTC, consistent with the events table.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Boolean, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Alert(Base):
    """A deduplicated alert produced by the correlation engine."""

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Stable deduplication key (rule + correlation entities).
    fingerprint: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )

    rule_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    rule_name: Mapped[str] = mapped_column(String(128), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # Investigation lifecycle status.
    status: Mapped[str] = mapped_column(
        String(24), index=True, nullable=False, default="open"
    )

    source_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    host: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    matched_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    evidence_event_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    explanation: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Distinguishes synthetic demo detections from real telemetry.
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    first_observed: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_observed: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_utcnow_naive
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_utcnow_naive
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_utcnow_naive
    )

    __table_args__ = (
        # Supports the default deterministic ordering (most recently detected).
        Index("ix_alerts_detected_id", "detected_at", "id"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Alert id={self.id} rule={self.rule_id!r} fp={self.fingerprint[:8]}>"
