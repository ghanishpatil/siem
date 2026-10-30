"""FastAPI application entry point.

This module only wires the application together: it creates the app, applies
middleware, initializes the database on startup, and registers routers.
Business logic lives in dedicated packages (``normalization``, ``detection``,
``repositories``) to keep boundaries clean.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.alerts import router as alerts_router
from app.api.events import router as events_router
from app.api.health import router as health_router
from app.config import settings
from app.db.init_db import init_db

logger = logging.getLogger("sentinelx.security")

# Conservative response headers applied to every API response. The API returns
# sensitive security data (alerts, evidence, raw events), so responses are
# marked non-cacheable, non-sniffable, and non-embeddable. These are safe for a
# JSON API and do not change any response body.
SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}


def _warn_on_insecure_cors() -> None:
    """Warn (do not block) if production is configured with a wildcard origin."""
    if settings.is_production and "*" in settings.cors_origins:
        logger.warning(
            "SIEM_CORS_ORIGINS includes a wildcard '*' in production. The API has "
            "no authentication, so set explicit frontend origin(s) instead of '*'."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle."""
    init_db()  # create tables if they do not yet exist (and validate persistence)
    _warn_on_insecure_cors()
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    # Reduce information disclosure on a publicly reachable, unauthenticated API:
    # the interactive docs and OpenAPI schema are served only outside production.
    docs_enabled = not settings.is_production
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Custom deterministic SIEM correlation engine (CIS-117).",
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    @app.middleware("http")
    async def _apply_security_headers(request: Request, call_next):
        response = await call_next(request)
        for header, value in SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
        return response

    # The API is stateless and cookie/token-free, so credentialed CORS is not
    # needed; keeping it disabled also avoids the browser's rejection of
    # credentials combined with permissive origins. Allowed origins come from
    # SIEM_CORS_ORIGINS (see app.config.Settings.cors_origins).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # All API routes are served under the /api prefix.
    app.include_router(health_router, prefix="/api")
    app.include_router(events_router, prefix="/api")
    app.include_router(alerts_router, prefix="/api")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
    )
