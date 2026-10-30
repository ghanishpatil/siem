"""Application configuration.

Settings are loaded from environment variables (prefixed ``SIEM_``) and an
optional ``.env`` file. No secrets are hardcoded here; secret-bearing values
must be supplied through the environment. See ``.env.example`` for the
available keys.
"""

from __future__ import annotations

import json
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Central application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="SIEM_",
        extra="ignore",
    )

    # Application metadata
    app_name: str = "SentinelX SIEM Correlation Engine"
    app_version: str = "0.1.0"
    environment: str = "development"

    # Server
    host: str = "127.0.0.1"
    port: int = 8000

    # Persistence. SQLite ships with Python; the DB file stays local.
    database_url: str = "sqlite:///./sentinelx.db"

    # CORS: origins allowed to call this API. Defaults to the Vite dev server.
    # In production set SIEM_CORS_ORIGINS to the deployed frontend origin(s);
    # either a comma-separated list or a JSON array is accepted (see validator).
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # ---- Ingestion limits (bounded to protect memory and the database) ----
    # Maximum number of events accepted in a single JSON (array) ingest call.
    max_batch_size: int = 1000
    # Maximum size of a JSON ingest request body, in bytes (~5 MB).
    max_ingest_bytes: int = 5_000_000
    # Maximum size of an uploaded JSONL file, in bytes (~10 MB).
    max_upload_bytes: int = 10_000_000
    # Maximum number of records processed from a single JSONL upload.
    max_jsonl_records: int = 10_000

    # ---- Query / pagination bounds ----
    default_page_limit: int = 50
    max_page_limit: int = 500

    # ---- Statistics ----
    # Window (hours) used for the "recent events" statistic, based on event
    # occurrence time (UTC).
    recent_window_hours: int = 24

    # ---- Detection / correlation ----
    # Upper bound on how many persisted events a single evaluation will scan,
    # keeping the local demonstration bounded.
    max_events_scan: int = 100_000

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: object) -> list[str]:
        """Accept CORS origins as a list, a JSON array string, or a
        comma-separated string.

        Platforms like Railway expose environment variables as plain strings,
        where a comma-separated list (``https://a.app,https://b.app``) is far
        less error-prone than JSON. A JSON array is still accepted for
        backwards compatibility. ``NoDecode`` on the field disables
        pydantic-settings' own JSON pre-parsing so this runs on the raw value.
        """
        if value is None:
            return []
        if isinstance(value, (list, tuple)):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return []
            if text.startswith("["):
                try:
                    parsed = json.loads(text)
                except json.JSONDecodeError as exc:
                    raise ValueError(
                        "SIEM_CORS_ORIGINS looks like a JSON array but could not "
                        f"be parsed: {exc}"
                    ) from exc
                if not isinstance(parsed, list):
                    raise ValueError("SIEM_CORS_ORIGINS JSON must be an array of strings")
                return [str(origin).strip() for origin in parsed if str(origin).strip()]
            return [origin.strip() for origin in text.split(",") if origin.strip()]
        raise ValueError("SIEM_CORS_ORIGINS must be a string or a list of strings")

    @property
    def is_production(self) -> bool:
        """True when running under a production environment setting."""
        return self.environment.strip().lower() == "production"


settings = Settings()
