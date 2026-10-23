"""Health-check endpoint.

Confirms the API process is up and that the database is reachable. Used by the
frontend during Phase 0 to verify end-to-end connectivity.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response, status as http_status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health_check(response: Response, db: Session = Depends(get_db)) -> HealthResponse:
    """Return service status and database connectivity.

    Responds with HTTP 200 when the database is reachable and HTTP 503 when it
    is not, so platform health checks (e.g. Railway) treat a database outage as
    unhealthy rather than routing traffic to a non-functional backend. The probe
    is a cheap ``SELECT 1`` with no table scan.
    """
    try:
        db.execute(text("SELECT 1"))
        database_status = "connected"
        service_status = "ok"
    except Exception:  # pragma: no cover - defensive; surfaced in response
        database_status = "unavailable"
        service_status = "degraded"
        response.status_code = http_status.HTTP_503_SERVICE_UNAVAILABLE

    return HealthResponse(
        status=service_status,
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        database=database_status,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
