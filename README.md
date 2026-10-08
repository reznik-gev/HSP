# HSP: Human-Space Program

HSP lets managers model workspaces in 3D with exact measurements (down to 1 cm): floors, walls, zones, seats and devices. It also manages the people in an organization's hierarchy and who sits where.

Every design decision is recorded in **[docs/](docs/README.md)**, one numbered and dated record per decision.

## Repository layout ([0018](docs/0018-2026-10-08-repository-layout.md))
| Path | What |
|---|---|
| [`backend/`](backend/README.md) | FastAPI service, SQLAlchemy models, Alembic migrations (Python 3.13, uv) |
| [`frontend/`](frontend/README.md) | React + TypeScript app with the headless editor core (pnpm, Vite) |
| `deploy/` | Docker Compose: `compose.dev.yml` for local development. Production stack and offline bundle to follow ([0054](docs/0054-2026-10-08-release-distribution.md), [0055](docs/0055-2026-10-08-deployment-target.md)) |
| `shared/` | Language-neutral validation test cases ([0051](docs/0051-2026-10-08-validation-feedback.md)) |
| `authz/` | OpenFGA model (deferred past v1) |
| `docs/` | Decision records |

## Quick start (development)
```bash
docker compose -f deploy/compose.dev.yml up -d     # PostGIS + Keycloak (admin/admin, viewer/viewer)

cd backend
uv sync && uv run alembic upgrade head
uv run uvicorn hsp.main:create_app --factory --reload   # http://localhost:8000/docs

cd ../frontend
pnpm install && pnpm dev                            # http://localhost:5173
```

## Contributing ([0064](docs/0064-2026-10-08-branching-workflow.md))
Trunk-based: short-lived branches and pull requests into `main`. The required check is `ci-ok` ([0070](docs/0070-2026-10-08-ci-gate-job.md)), and merges are **rebase-only** with linear history ([0069](docs/0069-2026-10-08-rebase-merges.md)), so keep commits clean and meaningful. Optional local hooks: `uv tool install pre-commit && pre-commit install`.

## License
Proprietary, source-visible: **all rights reserved** ([LICENSE](LICENSE), [0071](docs/0071-2026-10-08-license-and-contributions.md)). You may read the code, but you may not use, modify or deploy it without written permission. External pull requests are not accepted ([CONTRIBUTING.md](CONTRIBUTING.md)).
