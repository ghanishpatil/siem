"""Database initialization and lightweight schema evolution.

Creates all tables registered on the declarative ``Base`` using the project's
single shared engine. Importing ``app.models`` ensures every ORM model is
registered before ``create_all`` runs. This is invoked from the FastAPI
startup lifecycle in ``app.main``.

Because the project does not use a full migration framework, columns added to
an already-created table are applied here with ``ALTER TABLE ADD COLUMN`` (which
SQLite supports). This keeps existing local databases intact instead of
requiring a reset.
"""

from __future__ import annotations

import os

from sqlalchemy import inspect, text
from sqlalchemy.engine import make_url

import app.models  # noqa: F401  (import registers models on Base.metadata)
from app.config import settings
from app.db.base import Base
from app.db.session import engine

# Columns introduced after the initial ``events`` table shipped.
_EVENTS_ADDED_COLUMNS: dict[str, str] = {
    "destination_port": "INTEGER",
}


def _migrate_events_columns() -> None:
    inspector = inspect(engine)
    if "events" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("events")}
    missing = {
        name: ddl for name, ddl in _EVENTS_ADDED_COLUMNS.items() if name not in existing
    }
    if not missing:
        return
    with engine.begin() as connection:
        for name, ddl_type in missing.items():
            connection.execute(text(f"ALTER TABLE events ADD COLUMN {name} {ddl_type}"))


def validate_persistence_config() -> None:
    """Fail fast if production is configured with an ephemeral SQLite path.

    In production the backend refuses to start on a relative or in-memory
    SQLite database, because such a file lives in the container's ephemeral
    filesystem and is lost on every redeploy or restart. The operator must
    point ``SIEM_DATABASE_URL`` at an absolute path on a mounted persistent
    volume (for example ``sqlite:////data/sentinelx.db``). The application never
    silently falls back to an ephemeral database in production.
    """
    if not settings.is_production:
        return
    url = make_url(settings.database_url)
    if not url.drivername.startswith("sqlite"):
        return  # a non-SQLite backend manages its own persistence
    db_path = url.database or ""
    if db_path in ("", ":memory:") or not os.path.isabs(db_path):
        raise RuntimeError(
            "Refusing to start: SIEM_ENVIRONMENT=production but SIEM_DATABASE_URL "
            f"({settings.database_url!r}) points at an ephemeral SQLite path. Set it "
            "to an absolute path on a mounted persistent volume, for example "
            "sqlite:////data/sentinelx.db."
        )


def init_db() -> None:
    """Validate persistence, create tables if absent, then apply additive
    column migrations."""
    validate_persistence_config()
    Base.metadata.create_all(bind=engine)
    _migrate_events_columns()
