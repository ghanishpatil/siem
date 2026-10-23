"""Event ingestion, retrieval, and statistics endpoints.

Routes are thin: they parse/guard the request, delegate validation to
``app.normalization`` and persistence to ``app.repositories``, and shape the
response. No detection logic lives here.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.models.event import Event
from app.normalization.normalizer import EventValidationError, normalize_event
from app.normalization.vocab import normalize_event_type, normalize_severity
from app.repositories import event_repository as repo
from app.schemas.event import (
    AcceptedRecord,
    DuplicateRecord,
    EventListResponse,
    EventResponse,
    FieldError,
    IngestSummary,
    RejectedRecord,
    StatsResponse,
)

router = APIRouter(prefix="/events", tags=["events"])

# A parsed ingest entry: (index, parsed_object_or_None, pre_error_or_None).
Entry = tuple[int, Optional[dict], Optional[list[dict[str, str]]]]


class _IngestInputError(Exception):
    """Raised for whole-request input problems (bad JSON, too large)."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def to_event_response(event: Event) -> EventResponse:
    """Map an ORM Event to its API representation with UTC-aware timestamps."""
    from datetime import timezone

    return EventResponse(
        id=event.id,
        event_uid=event.event_uid,
        timestamp=event.timestamp.replace(tzinfo=timezone.utc),
        event_type=event.event_type,
        source_ip=event.source_ip,
        destination_ip=event.destination_ip,
        destination_port=event.destination_port,
        username=event.username,
        host=event.host,
        source=event.source,
        severity=event.severity,
        is_synthetic=event.is_synthetic,
        raw_event=event.raw_event,
        created_at=event.created_at.replace(tzinfo=timezone.utc),
    )


async def _entries_from_json(request: Request) -> list[Entry]:
    """Build ingest entries from a JSON body (single object or array)."""
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > settings.max_ingest_bytes:
                raise _IngestInputError(
                    413, f"request body exceeds {settings.max_ingest_bytes} bytes"
                )
        except ValueError:
            pass

    body = await request.body()
    if len(body) > settings.max_ingest_bytes:
        raise _IngestInputError(
            413, f"request body exceeds {settings.max_ingest_bytes} bytes"
        )

    try:
        data: Any = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise _IngestInputError(400, "request body is not valid JSON")

    if isinstance(data, dict):
        records = [data]
    elif isinstance(data, list):
        records = data
    else:
        raise _IngestInputError(
            400, "JSON body must be an object or an array of objects"
        )

    if len(records) > settings.max_batch_size:
        raise _IngestInputError(
            413, f"batch exceeds the maximum of {settings.max_batch_size} events"
        )

    return [(index, record, None) for index, record in enumerate(records)]


async def _entries_from_jsonl(request: Request) -> list[Entry]:
    """Build ingest entries from a multipart JSONL file upload.

    Reads the file line by line to bound memory, and enforces byte and record
    limits.
    """
    form = await request.form()
    upload = form.get("file")
    if upload is None or not hasattr(upload, "file"):
        raise _IngestInputError(400, "multipart upload must include a 'file' field")

    size = getattr(upload, "size", None)
    if size is not None and size > settings.max_upload_bytes:
        raise _IngestInputError(
            413, f"uploaded file exceeds {settings.max_upload_bytes} bytes"
        )

    entries: list[Entry] = []
    bytes_read = 0
    index = 0
    upload.file.seek(0)
    for raw_line in upload.file:  # iterate line-by-line (bounded memory)
        bytes_read += len(raw_line)
        if bytes_read > settings.max_upload_bytes:
            raise _IngestInputError(
                413, f"uploaded file exceeds {settings.max_upload_bytes} bytes"
            )
        line = raw_line.decode("utf-8", errors="replace").strip()
        if not line:
            continue
        if index >= settings.max_jsonl_records:
            raise _IngestInputError(
                413,
                f"upload exceeds the maximum of {settings.max_jsonl_records} records",
            )
        try:
            parsed = json.loads(line)
            entries.append((index, parsed, None))
        except json.JSONDecodeError as exc:
            entries.append(
                (index, None, [{"field": "_line", "message": f"invalid JSON: {exc.msg}"}])
            )
        index += 1

    return entries


def _process_entries(db: Session, entries: list[Entry]) -> IngestSummary:
    """Normalize, de-duplicate, and persist ingest entries."""
    accepted: list[AcceptedRecord] = []
    duplicates: list[DuplicateRecord] = []
    rejected: list[RejectedRecord] = []

    seen_uids: set[str] = set()
    to_insert: list[tuple[int, Any]] = []  # (index, NormalizedEvent)

    for index, raw, pre_error in entries:
        if pre_error is not None:
            rejected.append(
                RejectedRecord(index=index, errors=[FieldError(**e) for e in pre_error])
            )
            continue
        if not isinstance(raw, dict):
            rejected.append(
                RejectedRecord(
                    index=index,
                    errors=[FieldError(field="_root", message="record must be a JSON object")],
                )
            )
            continue
        try:
            normalized = normalize_event(raw)
        except EventValidationError as exc:
            rejected.append(
                RejectedRecord(
                    index=index,
                    event_uid=raw.get("event_uid"),
                    errors=[FieldError(**e) for e in exc.errors],
                )
            )
            continue

        if normalized.event_uid in seen_uids:
            duplicates.append(DuplicateRecord(index=index, event_uid=normalized.event_uid))
            continue
        seen_uids.add(normalized.event_uid)
        to_insert.append((index, normalized))

    # De-duplicate against the database.
    candidate_uids = [n.event_uid for _, n in to_insert]
    already_present = repo.existing_uids(db, candidate_uids)

    new_pairs = [(i, n) for i, n in to_insert if n.event_uid not in already_present]
    for i, n in to_insert:
        if n.event_uid in already_present:
            duplicates.append(DuplicateRecord(index=i, event_uid=n.event_uid))

    inserted = repo.add_events(db, [n for _, n in new_pairs])
    for (index, _), (event_id, uid) in zip(new_pairs, inserted):
        accepted.append(AcceptedRecord(index=index, id=event_id, event_uid=uid))

    return IngestSummary(
        received_count=len(entries),
        accepted_count=len(accepted),
        rejected_count=len(rejected),
        duplicate_count=len(duplicates),
        accepted=accepted,
        duplicates=duplicates,
        rejected=rejected,
    )


@router.post("/ingest")
async def ingest_events(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    """Ingest a single event, a JSON array of events, or a JSONL file upload."""
    content_type = request.headers.get("content-type", "")
    try:
        if content_type.startswith("multipart/form-data"):
            entries = await _entries_from_jsonl(request)
        else:
            entries = await _entries_from_json(request)
    except _IngestInputError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    if not entries:
        raise HTTPException(status_code=400, detail="no events provided")

    try:
        summary = _process_entries(db, entries)
    except HTTPException:
        raise
    except Exception:
        # Never leak internal tracebacks; ensure the transaction is rolled back.
        db.rollback()
        raise HTTPException(
            status_code=500, detail="internal error while persisting events"
        )

    if summary.accepted_count > 0 and summary.rejected_count == 0:
        status_code = 201
    elif summary.accepted_count > 0 and summary.rejected_count > 0:
        status_code = 207  # Multi-Status: partial success
    elif summary.rejected_count > 0:
        status_code = 400  # nothing accepted, at least one invalid
    else:
        status_code = 200  # nothing new (e.g. all duplicates)

    return JSONResponse(status_code=status_code, content=summary.model_dump())


@router.get("", response_model=EventListResponse)
def list_events(
    db: Session = Depends(get_db),
    limit: int = Query(default=settings.default_page_limit, ge=1, le=settings.max_page_limit),
    offset: int = Query(default=0, ge=0),
    event_type: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    source_ip: Optional[str] = Query(default=None),
) -> EventListResponse:
    """List stored events with bounded pagination and deterministic ordering."""
    normalized_type = normalize_event_type(event_type) if event_type else None
    normalized_sev = normalize_severity(severity) if severity else None

    items, total = repo.list_events(
        db,
        limit=limit,
        offset=offset,
        event_type=normalized_type,
        severity=normalized_sev,
        source_ip=source_ip or None,
    )
    return EventListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[to_event_response(e) for e in items],
    )


@router.get("/stats", response_model=StatsResponse)
def event_stats(db: Session = Depends(get_db)) -> StatsResponse:
    """Statistics computed from actual stored rows."""
    return StatsResponse(**repo.get_stats(db, settings.recent_window_hours))


@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)) -> EventResponse:
    """Retrieve a single stored event, or 404 if it does not exist."""
    event = repo.get_event(db, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    return to_event_response(event)
