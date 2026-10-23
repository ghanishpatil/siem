"""Pydantic schemas.

These define the API contract: request validation and response shaping. They
are intentionally separate from SQLAlchemy ORM models (which live in
``app.models``) so the wire format and the storage format can evolve
independently.
"""
