"""SQLAlchemy ORM models (database tables).

Kept separate from Pydantic schemas and from API routes. Importing this package
registers every model on ``Base.metadata`` so ``create_all`` can build the
tables.
"""

from app.models.alert import Alert  # noqa: F401  (registers the table)
from app.models.event import Event  # noqa: F401  (registers the table)

__all__ = ["Event", "Alert"]
