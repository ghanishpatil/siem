"""Shared pytest fixtures.

Each test that needs the database gets its own isolated temporary SQLite file,
and the application's ``get_db`` dependency is overridden to use it. The real
development database (``sentinelx.db``) is never touched.

``TestClient(app)`` is intentionally created without the context-manager form so
the application lifespan (which would call ``init_db()`` against the real shared
engine) does not run during tests.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  registers ORM models on Base.metadata
from app.db.base import Base
from app.db.session import get_db
from app.main import app


@pytest.fixture()
def db_session_factory(tmp_path):
    db_file = tmp_path / "test_events.db"
    url = f"sqlite:///{db_file.as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    try:
        yield testing_session
    finally:
        engine.dispose()


@pytest.fixture()
def client(db_session_factory):
    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
