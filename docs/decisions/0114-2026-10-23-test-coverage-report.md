# 0114 — A test coverage report on every merge to main

- **Date:** 2026-10-23
- **Status:** Accepted
- **Refines:** [0070](0070-2026-10-08-ci-gate-job.md) (the `backend` and `frontend` CI jobs)

## Context
The owner asked for a test coverage report whenever code is merged to `main`: how much of the code the tests run. The tests already run on every push to `main`, in the `backend` and `frontend` jobs of `ci.yml`. So the question is how to measure there, where the report goes, and whether it can fail anything.

## Options considered

| Option | Chosen | Why |
|---|---|---|
| **Measure in the existing test steps; keep the report as a workflow artifact** | ✅ | No new job, no second test run, and nothing to set up outside GitHub. |
| A separate coverage job | | Runs the tests a second time, with its own database, for the same result. |
| An outside service (Codecov, Coveralls) | | Needs a new secret and sends the code's coverage to a third party. The owner ruled it out. |

## Decision
1. **The tools.** The backend uses pytest-cov (coverage.py), with statements and branches. The frontend uses Vitest's own V8 provider, `@vitest/coverage-v8`, kept at the same version as Vitest. Their settings live in `backend/pyproject.toml` (`[tool.coverage.*]`) and `frontend/vite.config.ts` (`test.coverage`). Test files, test helpers, the SVG bench and the generated API types are not counted.
2. **Where to find it.** Each job writes a short table of the totals to the run's summary page. On a push to `main` it also uploads the full report as an artifact, kept for 30 days: `backend-coverage` (HTML, XML and JSON) and `frontend-coverage` (HTML, lcov and a JSON summary). Open the HTML report's `index.html` after downloading.
3. **A report, not a gate.** There are no thresholds. Coverage never fails a run or blocks a merge.
4. **Measured on pull requests too** (my lower-confidence choice). Measuring adds little time, so the test steps always measure and the summary table shows on PRs as well. Only the artifact upload is limited to `main`. This keeps one way of running the tests, and a PR that breaks the coverage set-up fails before it merges.
5. **Locally:** `uv run pytest --cov --cov-report=html` in `backend/` writes `backend/coverage/html/`; `pnpm test:coverage` in `frontend/` writes `frontend/coverage/`. Both folders are ignored by git.

## Consequences
- A merge that touches only one side reports only that side, because the other job is skipped (as [0070](0070-2026-10-08-ci-gate-job.md) intends). The last report for the other side is in an earlier run.
- If coverage ever slows the PR runs noticeably, item 4 can change to measure on `main` only, without touching the rest.
