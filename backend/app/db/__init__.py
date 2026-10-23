"""Database layer.

Owns the SQLAlchemy engine, session factory, and declarative base. This is the
only package that creates database sessions; API routes receive a session via
dependency injection and never construct one directly.
"""
