"""Event normalization.

Transforms an arbitrary raw event (a JSON object) into a ``NormalizedEvent``
ready for persistence, or raises ``EventValidationError`` with a structured,
actionable list of problems. This module performs no database access.

Rules:
- ``event_uid`` is used as supplied, or generated when absent.
- ``timestamp`` is required and must be a valid ISO-8601 datetime (or epoch
  seconds). It is converted to UTC. A missing or malformed timestamp is a
  rejection.
- ``event_type`` and ``severity`` are normalized against controlled
  vocabularies; unrecognized values are not trusted (mapped to ``unknown`` /
  ``info``) but the original payload is preserved in ``raw_event``.
- ``source_ip`` / ``destination_ip`` are validated as IP addresses when present;
  invalid values are rejections.
- All other optional fields are cleaned and default to ``None`` when absent.
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from app.normalization.vocab import normalize_event_type, normalize_severity


@dataclass
class NormalizedEvent:
    """A validated, normalized event ready to be persisted."""

    event_uid: str
    timestamp: datetime  # naive, represents UTC
    event_type: str
    severity: str
    source: str
    is_synthetic: bool
    raw_event: dict[str, Any]
    source_ip: Optional[str] = None
    destination_ip: Optional[str] = None
    destination_port: Optional[int] = None
    username: Optional[str] = None
    host: Optional[str] = None


class EventValidationError(Exception):
    """Raised when a raw event fails validation.

    ``errors`` is a list of ``{"field": ..., "message": ...}`` dictionaries.
    """

    def __init__(self, errors: list[dict[str, str]]) -> None:
        self.errors = errors
        super().__init__("event validation failed")


def _clean_str(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _parse_timestamp(value: object) -> Optional[datetime]:
    """Parse a timestamp to a naive UTC datetime, or return None if invalid."""
    # Epoch seconds (int/float, but not bool).
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc).replace(
                tzinfo=None
            )
        except (OverflowError, OSError, ValueError):
            return None

    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    # datetime.fromisoformat in Python 3.10 does not accept a trailing 'Z'.
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        # Naive input is assumed to already be UTC.
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(tzinfo=None)


def _validate_ip(value: object) -> Optional[str]:
    """Return the normalized IP string, or None if invalid."""
    try:
        return str(ipaddress.ip_address(str(value).strip()))
    except ValueError:
        return None


def _validate_port(value: object) -> Optional[int]:
    """Return a valid TCP/UDP port (0-65535), or None if invalid."""
    if isinstance(value, bool):
        return None
    try:
        port = int(value)
    except (TypeError, ValueError):
        return None
    return port if 0 <= port <= 65535 else None


def normalize_event(raw: dict[str, Any]) -> NormalizedEvent:
    """Normalize a raw event dict. Raises EventValidationError on failure."""
    errors: list[dict[str, str]] = []

    # event_uid: use supplied value or generate one.
    uid = _clean_str(raw.get("event_uid"))
    if uid is None:
        uid = uuid4().hex

    # timestamp: required and must be valid.
    ts_value = raw.get("timestamp")
    timestamp: Optional[datetime] = None
    if ts_value is None or (isinstance(ts_value, str) and not ts_value.strip()):
        errors.append({"field": "timestamp", "message": "timestamp is required"})
    else:
        timestamp = _parse_timestamp(ts_value)
        if timestamp is None:
            errors.append(
                {
                    "field": "timestamp",
                    "message": "timestamp must be an ISO-8601 datetime or epoch seconds",
                }
            )

    # IP addresses: validate when present.
    source_ip: Optional[str] = None
    raw_source_ip = raw.get("source_ip")
    if raw_source_ip not in (None, ""):
        source_ip = _validate_ip(raw_source_ip)
        if source_ip is None:
            errors.append(
                {"field": "source_ip", "message": f"{raw_source_ip!r} is not a valid IP address"}
            )

    destination_ip: Optional[str] = None
    raw_dest_ip = raw.get("destination_ip")
    if raw_dest_ip not in (None, ""):
        destination_ip = _validate_ip(raw_dest_ip)
        if destination_ip is None:
            errors.append(
                {
                    "field": "destination_ip",
                    "message": f"{raw_dest_ip!r} is not a valid IP address",
                }
            )

    # destination_port: validate when present.
    destination_port: Optional[int] = None
    raw_port = raw.get("destination_port")
    if raw_port not in (None, ""):
        destination_port = _validate_port(raw_port)
        if destination_port is None:
            errors.append(
                {
                    "field": "destination_port",
                    "message": f"{raw_port!r} is not a valid TCP/UDP port (0-65535)",
                }
            )

    if errors:
        raise EventValidationError(errors)

    assert timestamp is not None  # guaranteed: we raised above otherwise

    return NormalizedEvent(
        event_uid=uid,
        timestamp=timestamp,
        event_type=normalize_event_type(raw.get("event_type")),
        severity=normalize_severity(raw.get("severity")),
        source=_clean_str(raw.get("source")) or "unknown",
        is_synthetic=bool(raw.get("is_synthetic", False)),
        source_ip=source_ip,
        destination_ip=destination_ip,
        destination_port=destination_port,
        username=_clean_str(raw.get("username")),
        host=_clean_str(raw.get("host")),
        raw_event=raw,
    )
