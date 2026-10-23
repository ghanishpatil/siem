"""Foundational tests for the database layer.

Covers two things the project needs to be able to trust from the start:

1. The application's session factory (``get_db``) yields a working session.
2. File-based SQLite storage survives an application restart. A restart is
   simulated by disposing the engine (shutdown) and creating a fresh engine
   against the same file (startup), then confirming previously written data is
   still present. A temporary database is used so the real ``sentinelx.db`` is
   never touched.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.db.session import get_db


def test_get_db_yields_working_session() -> None:
    gen = get_db()
    db = next(gen)
    try:
        result = db.execute(text("SELECT 1")).scalar()
        assert result == 1
    finally:
        gen.close()


def test_sqlite_file_persists_across_restart(tmp_path: Path) -> None:
    db_file = tmp_path / "restart_test.db"
    url = f"sqlite:///{db_file.as_posix()}"

    # First run: create a table, write a row, then dispose the engine to
    # simulate the application shutting down.
    engine = create_engine(url, connect_args={"check_same_thread": False})
    session_factory = sessionmaker(bind=engine)
    with session_factory() as db:
        db.execute(text("CREATE TABLE probe (id INTEGER PRIMARY KEY, label TEXT)"))
        db.execute(text("INSERT INTO probe (label) VALUES ('persisted')"))
        db.commit()
    engine.dispose()

    assert db_file.exists(), "database file should exist on disk after writing"

    # Second run: a brand-new engine against the same file (a simulated restart)
    # must still see the previously written data.
    engine2 = create_engine(url, connect_args={"check_same_thread": False})
    session_factory2 = sessionmaker(bind=engine2)
    with session_factory2() as db:
        label = db.execute(text("SELECT label FROM probe WHERE id = 1")).scalar()
        assert label == "persisted"
    engine2.dispose()
