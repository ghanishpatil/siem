"""Schemas for the health endpoint."""

from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response body for ``GET /api/health``."""

    status: str
    app: str
    version: str
    environment: str
    database: str
    timestamp: str
