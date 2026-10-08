# 0014 — Persistence layer: SQLAlchemy 2 + Alembic

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **SQLAlchemy 2 (async) + Alembic** ✅
- SQLModel + Alembic: less boilerplate, but it lags SQLAlchemy and merges API and DB models.
- Raw SQL (asyncpg): maximum control, more code.

## Decision
- **SQLAlchemy 2.x** in async mode with the `asyncpg` driver.
- **GeoAlchemy2** for PostGIS types.
- **Alembic** for schema migrations.
- **Pydantic v2** schemas for the API, kept **separate** from ORM models.

## Consequences
- Clear layering: HTTP (FastAPI routers + Pydantic) → services/domain → repositories (SQLAlchemy). This keeps FastAPI-specific code thin ([0010](0010-2026-10-08-backend-stack.md)).
- Lazy loading is disabled (`lazy="raise"`). Relationships are loaded explicitly, which avoids async lazy-load errors.
- Tenant scoping ([0003](0003-2026-10-07-tenancy-model.md)) is enforced in the repository layer.
- Migrations run as a separate step/container during on-prem upgrades ([0005](0005-2026-10-07-deployment-model.md)).
