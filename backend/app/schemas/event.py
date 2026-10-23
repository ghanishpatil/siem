"""Pydantic schemas for the events API (request documentation and responses)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class EventIngest(BaseModel):
    """Documented shape of a single ingest event.

    Ingestion accepts additional/unknown fields (they are preserved in
    ``raw_event``), so extra keys are allowed. Validation and normalization are
    performed by ``app.normalization`` rather than by this model, so that one
    bad record does not fail an entire batch.
    """

    model_config = ConfigDict(extra="allow")

    event_uid: Optional[str] = Field(default=None, examples=["evt-0001"])
    timestamp: Optional[str] = Field(default=None, examples=["2026-10-16T09:00:00Z"])
    event_type: Optional[str] = Field(default=None, examples=["login_failed"])
    source_ip: Optional[str] = Field(default=None, examples=["10.0.0.5"])
    destination_ip: Optional[str] = Field(default=None, examples=["10.0.0.1"])
    destination_port: Optional[int] = Field(default=None, examples=[22])
    username: Optional[str] = Field(default=None, examples=["alice"])
    host: Optional[str] = Field(default=None, examples=["web-01"])
    source: Optional[str] = Field(default=None, examples=["linux-auth"])
    severity: Optional[str] = Field(default=None, examples=["high"])
    is_synthetic: Optional[bool] = Field(default=False)


class FieldError(BaseModel):
    field: str
    message: str


class RejectedRecord(BaseModel):
    index: int
    event_uid: Optional[str] = None
    errors: list[FieldError]


class AcceptedRecord(BaseModel):
    index: int
    id: int
    event_uid: str


class DuplicateRecord(BaseModel):
    index: int
    event_uid: str


class IngestSummary(BaseModel):
    received_count: int
    accepted_count: int
    rejected_count: int
    duplicate_count: int
    accepted: list[AcceptedRecord]
    duplicates: list[DuplicateRecord]
    rejected: list[RejectedRecord]


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_uid: str
    timestamp: datetime
    event_type: str
    source_ip: Optional[str]
    destination_ip: Optional[str]
    destination_port: Optional[int]
    username: Optional[str]
    host: Optional[str]
    source: str
    severity: str
    is_synthetic: bool
    raw_event: dict[str, Any]
    created_at: datetime


class EventListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[EventResponse]


class StatsResponse(BaseModel):
    total_events: int
    by_event_type: dict[str, int]
    by_severity: dict[str, int]
    recent_event_count: int
    recent_window_hours: int
    synthetic_count: int
    real_count: int
