# HSP: Human-Space Program

HSP lets managers model workspaces in 3D with exact measurements (down to 1 cm): floors, walls, zones, seats and devices. It also manages the people in an organization's hierarchy and who sits where.

Every design decision is recorded in **[docs/decisions/](docs/decisions/README.md)**, one numbered and dated record per decision. Other documentation lives under [docs/](docs/README.md).

## Repository layout ([0018](docs/decisions/0018-2026-10-08-repository-layout.md))
| Path | What |
|---|---|
| [`backend/`](backend/README.md) | FastAPI service, SQLAlchemy models, Alembic migrations (Python 3.13, uv) |
| [`frontend/`](frontend/README.md) | React + TypeScript app with the headless editor core (pnpm, Vite) |
| `deploy/` | Docker Compose: `compose.dev.yml` for local development. Production stack and offline bundle to follow ([0054](docs/decisions/0054-2026-10-08-release-distribution.md), [0055](docs/decisions/0055-2026-10-08-deployment-target.md)) |
| `shared/` | Language-neutral validation test cases ([0051](docs/decisions/0051-2026-10-08-validation-feedback.md)) |
| `authz/` | OpenFGA model (deferred past v1) |
| `scripts/` | Developer scripts, e.g. `restack.sh` for stacked PRs |
| `docs/` | Documentation: [decision records](docs/decisions/README.md), [guides](docs/guides/README.md), with more sections to come ([0075](docs/decisions/0075-2026-10-08-docs-directory-structure.md)) |

## Quick start (development)
```bash
docker compose -f deploy/compose.dev.yml up -d     # PostGIS + Keycloak (admin/admin, viewer/viewer)

cd backend
uv sync && uv run alembic upgrade head
uv run uvicorn hsp.main:create_app --factory --reload   # http://localhost:8000/docs

cd ../frontend
pnpm install && pnpm dev                            # http://localhost:5173
```

## Contributing ([0064](docs/decisions/0064-2026-10-08-branching-workflow.md))
Trunk-based: short-lived branches and pull requests into `main`. The required check is `ci-ok` ([0070](docs/decisions/0070-2026-10-08-ci-gate-job.md)), and merges are **rebase-only** with linear history ([0069](docs/decisions/0069-2026-10-08-rebase-merges.md)), so keep commits clean and meaningful. Stacked PRs target their parent branch, and after each merge `scripts/restack.sh` restacks the rest ([guide](docs/guides/stacked-prs.md), [0079](docs/decisions/0079-2026-10-08-stacked-pr-workflow.md)). Optional local hooks: `uv tool install pre-commit && pre-commit install`.

## License
Proprietary, source-visible: **all rights reserved** ([LICENSE](LICENSE), [0071](docs/decisions/0071-2026-10-08-license-and-contributions.md)). You may read the code, but you may not use, modify or deploy it without written permission. External pull requests are not accepted ([CONTRIBUTING.md](CONTRIBUTING.md)).
