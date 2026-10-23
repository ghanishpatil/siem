"""Declarative base for ORM models (SQLAlchemy 2.x style)."""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class all ORM models inherit from."""
