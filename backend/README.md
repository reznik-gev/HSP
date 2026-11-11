# HSP backend

The FastAPI service for HSP. Architecture decisions live in [`../docs`](../docs/README.md).

## Prerequisites
- [uv](https://docs.astral.sh/uv/). It installs Python 3.14 automatically ([0065](../docs/decisions/0065-2026-10-08-python-version-and-dev-tooling.md), [0091](../docs/decisions/0091-2026-10-15-python-3-14.md)). Python 3.15 waits until after 1.0.0 ([0127](../docs/decisions/0127-2026-11-08-python-3-15-after-1-0.md)).
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
| Test coverage | `uv run pytest --cov --cov-report=html`; the report is `coverage/html/index.html` ([0114](../docs/decisions/0114-2026-10-23-test-coverage-report.md)) |
| Lint / format / types | `uv run ruff check .` · `uv run ruff format .` · `uv run mypy` |
| Export OpenAPI | `uv run hsp-export-openapi openapi.json` (commit the result, [0039](../docs/decisions/0039-2026-10-08-frontend-api-client.md)) |

## Layout
The packages depend one way: `api` uses the area packages, and they use the shared modules, `models`, `db` and `config`. The area packages don't import FastAPI.

```
src/hsp/
  main.py            app factory; request IDs and request logs
  serve.py           `hsp-api`, the image's entry point: the metrics port, then the uvicorn workers
  config.py          settings from HSP_* environment variables
  db.py              async engine and sessions (docs/0014)
  models/            SQLAlchemy models of the v1 data model (docs/0034)
  api/               HTTP: routers and Pydantic models, all under /api/v1 (docs/0035)
                     v1.py lists the routers; pagination, ETags (caching.py) and health checks live here too

  Areas
  locations/         sites, buildings and floors, with a repository (docs/0078)
  plans/             plan versions, drafts, changesets, edit locks, publishing, geometry checks (docs/0028, 0080)
  org/               org units, positions, people and their import (docs/0006, 0084)
  seats/             assignments, search, occupancy, batch changes and imports (docs/0031, 0085)
  catalog/           zone types, the furniture and device catalog, devices (docs/0083)
  preferences.py     each user's language, theme, units and grid
  auth/              sign-in sessions for the browser, OIDC, roles and CSRF (docs/0038, 0077)

  Shared
  problems.py        RFC 9457 error replies (docs/0037)
  audit.py           audit records, written in the same transaction as the change (docs/0033)
  release.py         what an archive, reassignment or publish freed (docs/0086)
  imports.py         shared CSV and Excel import plumbing (docs/0084)
  tenancy.py         the one default tenant (docs/0003)
  logging.py, metrics.py, tracing.py, readiness.py
                     JSON logs, /metrics, OpenTelemetry and /readyz (docs/0057, 0105)
  openapi_export.py  `hsp-export-openapi`, writes openapi.json
migrations/          Alembic; never run from the API process (docs/0056)
tests/unit/          fast tests, no Docker; API tests send real requests with fakes behind them
tests/db/            DB integration tests (docs/0061), need HSP_TEST_DATABASE_URL
tests/fakes.py, stubs.py
                     in-memory repositories and stub services for unit tests
```

## Conventions
- Lengths are integer **mm**, rotation is integer **decidegrees**, and geometry is PostGIS SRID 0 on a whole-mm grid ([0029](../docs/decisions/0029-2026-10-08-geometry-representation.md)).
- IDs are UUIDv7, generated in the app ([0030](../docs/decisions/0030-2026-10-08-primary-keys.md)).
- **Where a service's SQL goes.** Locations, plan reads and sign-in sessions keep their queries in a repository, and their services are unit-tested with in-memory fakes. The other areas' services run their own queries and are tested against the database. New code follows the area it's in, and a new area starts with a repository. The rest moves into repositories after 1.2 ([0110](../docs/decisions/0110-2026-10-22-repositories-after-1-2.md)).
- A new write route needs `dependencies=WRITE` (admin and CSRF checks), and a line in `tests/unit/test_write_access.py`.
- After changing the API, export `openapi.json` and run `pnpm api:types` in `frontend/`. CI fails if either is stale.
- Every new DB constraint or non-trivial query must come with a test in `tests/db` ([0061](../docs/decisions/0061-2026-10-08-test-strategy.md)).
- How to write tests (stubs, fakes, fixtures): [docs/guides/testing.md](../docs/guides/testing.md).
