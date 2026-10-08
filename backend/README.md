# HSP backend

The FastAPI service for HSP. Architecture decisions live in [`../docs`](../docs/README.md).

## Prerequisites
- [uv](https://docs.astral.sh/uv/). It installs Python 3.13 automatically ([0065](../docs/decisions/0065-2026-10-08-python-version-and-dev-tooling.md)).
- The dev database and Keycloak: `docker compose -f ../deploy/compose.dev.yml up -d`

## Common tasks
| Task | Command |
|---|---|
| Install dependencies | `uv sync` |
| Apply migrations | `uv run alembic upgrade head` |
| Create a migration | `uv run alembic revision --autogenerate -m "..."`, then **review it** |
| Check models vs DB drift | `uv run alembic check` |
| Run the API (reload) | `uv run uvicorn hsp.main:create_app --factory --reload` |
| Unit tests | `uv run pytest` (DB tests are skipped) |
| All tests incl. DB | `HSP_TEST_DATABASE_URL=postgresql+asyncpg://hsp:hsp@localhost:5432/hsp_test uv run pytest` |
| Lint / format / types | `uv run ruff check .` · `uv run ruff format .` · `uv run mypy` |
| Export OpenAPI | `uv run hsp-export-openapi openapi.json` (commit the result, [0039](../docs/decisions/0039-2026-10-08-frontend-api-client.md)) |

## Layout
```
src/hsp/
  main.py          app factory, request-ID middleware
  config.py        settings from HSP_* environment variables
  problems.py      RFC 9457 Problem Details (docs/0037)
  db.py            async engine/session (docs/0014)
  api/             routers; everything public lives under /api/v1 (docs/0035)
  models/          SQLAlchemy models of the v1 data model (docs/0034)
migrations/        Alembic; never run from the API process (docs/0056)
tests/unit/        fast tests, no Docker
tests/db/          DB integration tests (docs/0061), need HSP_TEST_DATABASE_URL
```

## Conventions
- Lengths are integer **mm**, rotation is integer **decidegrees**, and geometry is PostGIS SRID 0 on a whole-mm grid ([0029](../docs/decisions/0029-2026-10-08-geometry-representation.md)).
- IDs are UUIDv7, generated in the app ([0030](../docs/decisions/0030-2026-10-08-primary-keys.md)).
- Every new DB constraint or non-trivial query must come with a test in `tests/db` ([0061](../docs/decisions/0061-2026-10-08-test-strategy.md)).
