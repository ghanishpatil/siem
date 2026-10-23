"""Foundational tests: application configuration loads with sane defaults."""

from __future__ import annotations

from app.config import settings


def test_database_url_is_sqlite() -> None:
    assert settings.database_url.startswith("sqlite")


def test_app_metadata_present() -> None:
    assert settings.app_name
    assert settings.app_version == "0.1.0"
    assert settings.environment


def test_cors_origins_configured() -> None:
    assert isinstance(settings.cors_origins, list)
    assert len(settings.cors_origins) >= 1
