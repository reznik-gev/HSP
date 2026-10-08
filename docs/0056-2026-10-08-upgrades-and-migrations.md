# 0056 — Upgrades & migrations: maintenance window + migrate job

- **Date:** 2026-10-08
- **Status:** Accepted
- **Builds on:** [0014](0014-2026-10-08-persistence-layer.md), [0054](0054-2026-10-08-release-distribution.md)

## Options considered
- **Maintenance window + migrate job** ✅
- Zero-downtime (expand/contract)
- Auto-migrate on API startup

## Decision
`bin/hsp upgrade <bundle>` performs these steps:
1. Verify the bundle checksums. Check the **upgrade path**: an upgrade may cross at most one MAJOR version at a time ([0063](0063-2026-10-08-release-versioning.md)).
2. Load the new images.
3. **Take a pre-upgrade backup** ([0058](0058-2026-10-08-backups.md)). Abort if it fails.
4. Stop `api` (nginx shows a maintenance page).
5. Run the one-shot **`migrate`** container (`alembic upgrade head`) for HSP, and let Keycloak migrate its own schema on start.
6. Start the new `api` and wait for `/readyz`, then re-enable traffic.

**Rollback:** if a step fails after the backup, `hsp rollback` restores the pre-upgrade backup and restarts the previous images, which are kept until the next successful upgrade.

## Consequences
- A few minutes of downtime per upgrade, which is acceptable for an internal on-prem tool.
- Migrations only need to be **forward-correct**. They don't have to stay compatible with the old app version. Alembic downgrades aren't relied on, because rollback means restoring the backup.
- CI tests every migration against a database seeded from the previous release's schema ([0061](0061-2026-10-08-test-strategy.md)).
- The API never runs migrations itself. On startup it checks the schema revision and refuses to start if it doesn't match.
