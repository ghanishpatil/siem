"""API route handlers.

Modules here are thin controllers: they validate input via Pydantic schemas,
delegate to repositories/services, and shape responses. They must not contain
detection logic or direct database access beyond the injected session.
"""
