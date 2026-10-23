# Testing strategy — SentinelX SIEM Correlation Engine

## 1. Principles

- Each phase ships with tests and is verified before the next phase starts.
- Detection is deterministic, which makes it directly assertable: the same
  events and rules always yield the same alerts.
- Tests run fully locally with no external services.
- No feature is claimed to work until it has a passing, meaningful test.

## 2. Backend (primary, pytest)

The backend carries the bulk of the test suite because it owns validation,
persistence, normalization, and detection.

| Layer            | What is tested                                            | Approach |
|------------------|-----------------------------------------------------------|----------|
| API              | Status codes, validation errors, response contract        | FastAPI `TestClient` |
| Schemas          | Accept valid payloads, reject invalid ones                | Pydantic unit tests |
| Repositories     | Create/read round-trips                                   | Temporary SQLite DB |
| Normalization    | Raw vendor formats map to the canonical schema            | Pure-function unit tests |
| Detection rules  | Each rule fires on triggering sequences and stays silent otherwise; evidence and explanation are correct | Table-driven unit tests over fixed event sets |

Test isolation: database-touching tests use a temporary/throwaway SQLite
database (e.g. a per-test temp file or an in-memory engine) so they never alter
development data.

Run:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest
```

## 3. Frontend (secondary)

The frontend is presentational and talks to the backend only through the typed
API client. Given the demonstration timeline, automated frontend testing is
optional and, if added, focuses on a few key components (e.g. alert rendering)
with Vitest + React Testing Library. Primary frontend verification for the demo
is manual: load the dashboard and confirm it renders live backend data.

## 4. Phase-by-phase test focus

| Phase | Test focus                                                          |
|-------|---------------------------------------------------------------------|
| 0     | Health endpoint responds; DB reachable; app boots (this phase).     |
| 1     | Ingestion validates and persists; bad payloads are rejected.        |
| 2     | Normalization output matches the canonical schema for sample inputs.|
| 3     | Rule 1 fires on repeated auth failures with correct evidence/why.   |
| 4     | API endpoints the dashboard depends on return expected shapes.      |
| 5     | Each additional rule: fires when it should, silent when it should not.|
| 6     | WebSocket delivers new events/alerts.                               |

## 5. Current status (Phase 0)

`tests/test_health.py` verifies that `GET /api/health` returns `200`, reports
the database as `connected`, and includes version and timestamp fields.
