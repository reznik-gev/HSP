# 0109 — The schema check at startup runs everywhere; unit tests opt out

- **Date:** 2026-10-23
- **Status:** Accepted
- **Refines:** [0056](0056-2026-10-08-upgrades-and-migrations.md), [0105](0105-2026-10-21-metrics-and-tracing.md) (item 2: the schema check at startup)

## Context
[0056](0056-2026-10-08-upgrades-and-migrations.md) and [0105](0105-2026-10-21-metrics-and-tracing.md) say the API refuses to start when the database's schema doesn't match the code. The first version of that check ran only in production; development and tests started anyway and reported the mismatch on `/readyz`. Review of #100 asked why tests and development shouldn't behave like production.

There were two real reasons for limiting it to production:
- **Unit tests start the app with no database**, so the check can't connect.
- **In development, switching to an older branch** leaves the database at a newer migration. The older code can't undo it, because the migration's script isn't on that branch.

## Options considered
The owner chose:

| Option | Chosen | Why |
|---|---|---|
| **Everywhere; unit tests opt out** in one named fixture | ✅ | Development and production behave the same, so a forgotten migration shows up as a clear refusal instead of strange SQL errors later. The one exception is visible and says why: unit tests have no database. |
| Production only (as first built) | | Development and tests would behave differently from production, without anything in the tests saying so. |
| Everywhere, but development only warns | | A middle ground with one more code path to keep. |

## Decision
- The API checks the schema at every start, in every environment, and refuses to start on a mismatch.
- **Unit tests** (`backend/tests/unit/`) replace the check with one that does nothing, in the autouse fixture `no_database_at_startup` in `tests/unit/conftest.py`. The test of the refusal itself plugs in a check that fails.
- **Database tests** don't start the app. If they do one day, their database is migrated to the head, so the check passes.

## Consequences
- After switching to an older branch, a developer must bring the database to that branch's head before the API starts. Moving forward, that's `uv run alembic upgrade head`. Moving back past a migration the older branch doesn't have, run `uv run alembic downgrade <revision>` on the newer branch first, or start from an empty development database.
- The refusal message is the same everywhere: it names both revisions and says to run the migrate job.
