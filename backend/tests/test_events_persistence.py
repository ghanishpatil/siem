"""Persistence test: events written by one engine survive a simulated restart.

Uses a temporary database file so the real development database is untouched.
"""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  registers ORM models on Base.metadata
from app.db.base import Base
from app.normalization.normalizer import normalize_event
from app.repositories import event_repository as repo


def test_events_persist_across_new_engine(tmp_path):
    db_file = tmp_path / "persist.db"
    url = f"sqlite:///{db_file.as_posix()}"

    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine)

    normalized = normalize_event(
        {
            "event_uid": "persist-1",
            "timestamp": "2026-10-16T09:00:00Z",
            "event_type": "login_failed",
            "severity": "high",
            "source": "demo",
        }
    )
    with session_factory() as db:
        inserted = repo.add_events(db, [normalized])
        assert inserted[0][1] == "persist-1"
    engine.dispose()

    # A brand-new engine against the same file simulates a backend restart.
    engine2 = create_engine(url, connect_args={"check_same_thread": False})
    session_factory2 = sessionmaker(bind=engine2)
    with session_factory2() as db:
        stored = repo.get_event(db, 1)
        assert stored is not None
        assert stored.event_uid == "persist-1"
        assert stored.event_type == "authentication_failure"
        assert stored.severity == "high"
    engine2.dispose()
