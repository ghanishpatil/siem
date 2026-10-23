# Architecture — SentinelX SIEM Correlation Engine

## 1. Overview

A two-tier application: a React/Vite dashboard (frontend) and a FastAPI service
(backend). The frontend communicates with the backend exclusively over HTTP
APIs (and, in a later phase, WebSockets). The backend owns all validation,
persistence, normalization, detection, and alert generation.

## 2. Component diagram (logical)

```
                         ┌─────────────────────────────────────────┐
                         │                Backend                   │
                         │                                          │
  Event sources ──POST──▶│  api/  ──▶ schemas/ (validate)           │
  (synthetic / local)    │    │                                     │
                         │    ▼                                     │
                         │  repositories/ ──▶ db/ (SQLite)          │
                         │    │                                     │
                         │    ▼                                     │
                         │  normalization/ ──▶ canonical events     │
                         │    │                                     │
                         │    ▼                                     │
                         │  detection/ (rules) ──▶ alerts           │
                         │    │                                     │
                         │    ▼                                     │
  Dashboard ◀───GET/WS───│  api/ (events, alerts)                   │
                         └─────────────────────────────────────────┘
```

## 3. Backend package responsibilities

| Package                | Responsibility                                               |
|------------------------|--------------------------------------------------------------|
| `app.main`             | App creation, middleware (CORS), router registration only.   |
| `app.config`           | Environment-based settings. No hardcoded secrets.            |
| `app.api`              | Thin HTTP controllers; validate, delegate, respond.          |
| `app.schemas`          | Pydantic request/response models (the API contract).         |
| `app.models`           | SQLAlchemy ORM models (database tables).                     |
| `app.db`               | Engine, session factory, declarative base. Sole session owner.|
| `app.repositories`     | All database queries (keeps SQL out of routes).              |
| `app.normalization`    | Raw → canonical event transformation. No rule knowledge.     |
| `app.detection`        | Deterministic correlation engine + configurable rules.       |

## 4. Enforced boundaries

- The frontend never contains detection logic; rules live only in
  `app.detection`.
- Normalization (`app.normalization`) is independent of detection
  (`app.detection`).
- API routes never build database sessions or queries directly; they depend on
  `app.db.get_db` and call `app.repositories`.
- Configuration is injected from the environment; secrets are never committed.
- Synthetic data carries an explicit marker so it is distinguishable from real
  telemetry across storage and UI.

## 5. Data flow

1. An event arrives at `POST /api/events` (Phase 1).
2. `schemas` validate the payload; invalid events are rejected.
3. `repositories` persist the raw event (Phase 1).
4. `normalization` maps it to a canonical event and persists that (Phase 2).
5. The `detection` engine evaluates rules over canonical events and emits
   evidence-linked, explainable alerts (Phase 3+).
6. The dashboard reads events and alerts via `GET` endpoints, and later
   receives live pushes over WebSockets (Phase 6).

## 6. Canonical event (target shape, finalized in Phase 2)

A normalized event is expected to carry at minimum: timestamp, event type
(e.g. `auth.failure`, `auth.success`), source identity (host/IP/user where
applicable), target identity, outcome, a raw-event reference, and a
`source` / `is_synthetic` marker. The exact schema is defined and tested in
Phase 2.

## 7. Frontend structure

| Folder             | Responsibility                                          |
|--------------------|---------------------------------------------------------|
| `src/api`          | Typed HTTP client; the only place that calls the backend.|
| `src/types`        | TypeScript types mirroring backend schemas.             |
| `src/components`   | Presentational components (tables, charts, alert cards).|
| `src/pages`        | Dashboard views composed from components.               |
| `src/hooks`        | Data-fetching hooks.                                     |

## 8. Runtime / ports

- Backend (uvicorn): `http://127.0.0.1:8000`, API under `/api`, docs at `/docs`.
- Frontend (Vite): `http://localhost:5173`.
- CORS on the backend allows the Vite origins listed in `app.config`.
