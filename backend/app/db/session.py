"""Database engine and session management."""

from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings


def _ensure_sqlite_parent_dir(database_url: str) -> None:
    """Create the parent directory for a file-based SQLite database if needed.

    This lets the database live on a mounted persistent volume (for example
    ``sqlite:////data/sentinelx.db`` on Railway) without the operator having to
    pre-create the directory. In-memory and non-SQLite URLs are ignored, and the
    default local path (``./sentinelx.db``) resolves to an existing directory,
    so this is a safe no-op in development and tests.
    """
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite"):
        return
    db_path = url.database
    if not db_path or db_path == ":memory:":
        return
    parent = os.path.dirname(os.path.abspath(db_path))
    if parent:
        os.makedirs(parent, exist_ok=True)


# SQLite needs check_same_thread disabled for use within FastAPI's threadpool.
_connect_args = (
    {"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {}
)

_ensure_sqlite_parent_dir(settings.database_url)

engine = create_engine(settings.database_url, connect_args=_connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a scoped database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
