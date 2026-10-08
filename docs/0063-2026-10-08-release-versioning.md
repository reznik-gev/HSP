# 0063 — Release versioning: SemVer

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **SemVer** ✅
- CalVer

## Decision
HSM releases use **MAJOR.MINOR.PATCH**, applied to the whole product (one version for the bundle, [0018](0018-2026-10-08-repository-layout.md), [0054](0054-2026-10-08-release-distribution.md)):

| Bump | Meaning for operators |
|---|---|
| **MAJOR** | Breaking: removal of `/api/vN` ([0035](0035-2026-10-08-api-style.md)), required manual upgrade steps, a dropped host OS or Postgres version, or config format changes |
| **MINOR** | New features. Migrations may run, and upgrades go through the standard `hsm upgrade` |
| **PATCH** | Fixes only. Migrations only if a fix requires one |

- Pre-releases: `1.2.0-rc.1`.
- Upgrades may skip any number of MINOR and PATCH versions but **not a MAJOR**: 1.x → 3.x must go through 2.x ([0056](0056-2026-10-08-upgrades-and-migrations.md)).
- The version is set from the git tag at build time and shown in the UI and `/readyz`.

## Consequences
- The release number tells operators how risky an upgrade is.
- The API version (`/api/v1`) and the product version are separate. A MAJOR product bump doesn't automatically mean a new API version.
