"""Controlled vocabularies for event normalization.

Client-supplied ``event_type`` and ``severity`` values are never trusted
verbatim. They are mapped to a small, fixed set of canonical values here.
Unrecognized values map to a safe default (``unknown`` event type, ``info``
severity) while the original value is always preserved in ``raw_event``.
"""

from __future__ import annotations

# ---- Canonical event types ----
AUTH_SUCCESS = "authentication_success"
AUTH_FAILURE = "authentication_failure"
AUTH_LOGOUT = "authentication_logout"
PRIVILEGE_ESCALATION = "privilege_escalation"
NETWORK_CONNECTION = "network_connection"
PORT_SCAN = "port_scan"
PROCESS_CREATION = "process_creation"
FILE_ACCESS = "file_access"
UNKNOWN_EVENT = "unknown"

CANONICAL_EVENT_TYPES: frozenset[str] = frozenset(
    {
        AUTH_SUCCESS,
        AUTH_FAILURE,
        AUTH_LOGOUT,
        PRIVILEGE_ESCALATION,
        NETWORK_CONNECTION,
        PORT_SCAN,
        PROCESS_CREATION,
        FILE_ACCESS,
        UNKNOWN_EVENT,
    }
)

# Synonyms -> canonical event type (keys are compared lowercased).
EVENT_TYPE_SYNONYMS: dict[str, str] = {
    "authentication_failure": AUTH_FAILURE,
    "auth_failure": AUTH_FAILURE,
    "login_failed": AUTH_FAILURE,
    "login_failure": AUTH_FAILURE,
    "failed_login": AUTH_FAILURE,
    "failed_password": AUTH_FAILURE,
    "invalid_login": AUTH_FAILURE,
    "authentication_success": AUTH_SUCCESS,
    "auth_success": AUTH_SUCCESS,
    "login_success": AUTH_SUCCESS,
    "successful_login": AUTH_SUCCESS,
    "accepted_password": AUTH_SUCCESS,
    "logout": AUTH_LOGOUT,
    "logoff": AUTH_LOGOUT,
    "session_closed": AUTH_LOGOUT,
    "privilege_escalation": PRIVILEGE_ESCALATION,
    "privesc": PRIVILEGE_ESCALATION,
    "sudo": PRIVILEGE_ESCALATION,
    "role_change": PRIVILEGE_ESCALATION,
    "network_connection": NETWORK_CONNECTION,
    "connection": NETWORK_CONNECTION,
    "connect": NETWORK_CONNECTION,
    "port_scan": PORT_SCAN,
    "portscan": PORT_SCAN,
    "process_creation": PROCESS_CREATION,
    "process_start": PROCESS_CREATION,
    "exec": PROCESS_CREATION,
    "file_access": FILE_ACCESS,
    "file_read": FILE_ACCESS,
    "file_write": FILE_ACCESS,
}

# ---- Canonical severities ----
SEV_CRITICAL = "critical"
SEV_HIGH = "high"
SEV_MEDIUM = "medium"
SEV_LOW = "low"
SEV_INFO = "info"

CANONICAL_SEVERITIES: frozenset[str] = frozenset(
    {SEV_CRITICAL, SEV_HIGH, SEV_MEDIUM, SEV_LOW, SEV_INFO}
)

DEFAULT_SEVERITY = SEV_INFO

SEVERITY_SYNONYMS: dict[str, str] = {
    "critical": SEV_CRITICAL,
    "crit": SEV_CRITICAL,
    "fatal": SEV_CRITICAL,
    "emergency": SEV_CRITICAL,
    "alert": SEV_CRITICAL,
    "high": SEV_HIGH,
    "error": SEV_HIGH,
    "err": SEV_HIGH,
    "severe": SEV_HIGH,
    "medium": SEV_MEDIUM,
    "med": SEV_MEDIUM,
    "warning": SEV_MEDIUM,
    "warn": SEV_MEDIUM,
    "low": SEV_LOW,
    "notice": SEV_LOW,
    "minor": SEV_LOW,
    "info": SEV_INFO,
    "informational": SEV_INFO,
    "information": SEV_INFO,
    "debug": SEV_INFO,
}


def normalize_event_type(value: object) -> str:
    """Map an arbitrary event-type value to a canonical type.

    Returns ``unknown`` for missing or unrecognized values.
    """
    if value is None:
        return UNKNOWN_EVENT
    key = str(value).strip().lower()
    if not key:
        return UNKNOWN_EVENT
    if key in EVENT_TYPE_SYNONYMS:
        return EVENT_TYPE_SYNONYMS[key]
    if key in CANONICAL_EVENT_TYPES:
        return key
    return UNKNOWN_EVENT


def normalize_severity(value: object) -> str:
    """Map an arbitrary severity value to a canonical severity.

    Returns ``info`` for missing or unrecognized values.
    """
    if value is None:
        return DEFAULT_SEVERITY
    key = str(value).strip().lower()
    if not key:
        return DEFAULT_SEVERITY
    if key in SEVERITY_SYNONYMS:
        return SEVERITY_SYNONYMS[key]
    if key in CANONICAL_SEVERITIES:
        return key
    return DEFAULT_SEVERITY


# Event types treated as "sensitive actions" for privilege-escalation
# correlation (rule PRIV-001): actions that are notable when they immediately
# follow a privilege change. Kept explicit and documented so the mapping is
# testable.
SENSITIVE_ACTION_TYPES: frozenset[str] = frozenset({FILE_ACCESS, PROCESS_CREATION})
