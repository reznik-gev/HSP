# HSP

HSP (Human-Space Program) manages office space: sites, buildings and floors drawn as plans, seats assigned to people and teams, and the org chart. It is a FastAPI backend (`backend/`, Python, uv) and a React frontend (`frontend/`, TypeScript, pnpm). Start with the [README](README.md) for the layout and how to run it.

## Read these first
- [docs/decisions/](docs/decisions/README.md): every product and technical decision, numbered and indexed. Follow them. An accepted record is never edited; a new record supersedes it.
- [docs/guides/git.md](docs/guides/git.md): branches, commits, review fixes and merging.
- [docs/guides/stacked-prs.md](docs/guides/stacked-prs.md): stacked PRs with `gh stack`.
- [docs/guides/testing.md](docs/guides/testing.md): how tests are written, with a review checklist.
- [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md): commands, layout and conventions for each side.
- [shared/validation-cases/](shared/validation-cases/README.md): plan rules as data, run by both sides.

## Before you push
Run the checks for each side you changed, the same ones CI runs (see each side's README): `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy` and `uv run pytest` in `backend/`; `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm test` in `frontend/`. Don't push anything that fails them. If you can't run a check, say so in your reply.

## Working with the product owner
- **Product dilemmas go to the owner:** scope, order, and behaviour users notice. Present the options with their trade-offs and a recommendation, one question at a time, then record the answer as a decision.
- **Small UI details you're confident about, decide yourself,** and mark them in the record as your lower-confidence choice. Ask when genuinely unsure.
- When the owner reviews a set of choices, present them one by one, in order.
- Every user-facing text exists in **English and Hebrew** (`frontend/src/i18n/`).
- Write in plain English: short sentences, no jargon the reader needs to look up.
