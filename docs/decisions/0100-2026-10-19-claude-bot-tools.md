# 0100 — The @claude bot runs the checks and searches the web

- **Date:** 2026-10-19
- **Status:** Superseded by [0101](0101-2026-10-19-claude-reviews-only.md): the bot reviews and never changes code.

## Context
The owner wants to handle review fixes by mentioning `@claude` on a PR. The first try, on #84 and #85, showed two problems:
1. **It couldn't check its own work.** By default the action only lets the bot read and edit files and commit. It wasn't allowed to run `uv run` or search the web, and the runner had no uv, no packages and no database. So it pushed a fix it hadn't tested, and that fix broke the lint check. It also skipped a comment that asked it to search the web for a package.
2. **Its pushes failed the review job.** Every push starts the code review workflow. The action refuses to run for a bot unless the bot is named in `allowed_bots`.

## Decision
- `claude.yml` sets up the same tools as CI's `backend` and `frontend` jobs: uv with the backend packages, pnpm with the frontend packages, and a PostGIS service with the same test database settings.
- The bot may run `uv run`, `uv sync`, `uv lock`, `pnpm`, read-only `git` and `gh` commands, `WebSearch` and `WebFetch`. Commits and pushes still go through the action's own tools. Other commands stay blocked.
- The checkout has full history, so the bot can diff a PR against the one below it in a stack.
- `claude-code-review.yml` sets `allowed_bots: claude`, so the bot's review fixes get a review too.
- `CLAUDE.md` says to run the checks before pushing, and to say so when a check couldn't run.

## Consequences
- The bot can run any code in the repo. Only people with write access can trigger it (the action checks), so that's the same trust as merging a PR.
- A bot run takes about a minute longer, because it installs packages and starts the database first.
- Comment-triggered workflows run from `main`'s copy of the file, so changes to `claude.yml` take effect only after they merge.
