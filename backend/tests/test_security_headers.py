"""Phase 9: hardening response headers are applied to every API response."""

from __future__ import annotations

from app.main import SECURITY_HEADERS


def test_security_headers_present_on_success(client) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    for header, value in SECURITY_HEADERS.items():
        assert resp.headers.get(header) == value


def test_security_headers_present_on_error(client) -> None:
    # Even a 404 still carries the hardening headers.
    resp = client.get("/api/alerts/99999999")
    assert resp.status_code == 404
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("Cache-Control") == "no-store"
