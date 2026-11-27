# 0157 — What to do about 1.0.0's scan findings

- **Date:** 2026-11-27
- **Status:** Accepted
- **Refines:** [0129](0129-2026-11-08-first-scan-findings.md) (the first scan's findings), [0102](0102-2026-10-19-release-workflow.md) (who checks a release before it's published)
- **Relates to:** [0097](0097-2026-10-18-production-images.md) (PostGIS stays as published), [0128](0128-2026-11-08-vulnerability-scanning.md) (the scan)

## Context
The first release candidate, `v1.0.0-rc.1`, passed every check of the release workflow. Its scans warned about more than [0129](0129-2026-11-08-first-scan-findings.md) covered:
- **`dnspython` 2.9.0** in `musical-chairs-api`: 1 High, fixed in 2.9.2. `email-validator` brings it in, and Musical Chairs never asks it to look up a domain (`check_deliverability` is off). It was the only fixable finding in our own images.
- **`postgis/postgis:18-3.6`**, built on 2026-10-26: 6 Critical and 205 High, 261 of all its findings with a fix. Dependabot had closed its bumps to `18-3.7` ([#185](https://github.com/reznik-gev/MusicalChairs/pull/185), [#186](https://github.com/reznik-gev/MusicalChairs/pull/186)) as "up-to-date", so nothing moved it. `18-3.7`, built on 2026-11-24, has 2 Critical and 121 High, and 65 with a fix: 61 in gosu's Go standard library (0129 accepted those) and 4 in Debian packages the image hasn't upgraded yet (`zstd`, 1 High; `passwd` and `login.defs`).
- **`quay.io/keycloak/keycloak:26.8`**, the newest release (26.8.2): 6 with a fix, all in jars inside Keycloak. Guava 33.6.0 (1 High, fixed in 33.7.2), the OpenTelemetry API 1.62.0 (1 Medium, fixed in 1.67.0) and the MariaDB driver 3.5.10 (3 Medium, 1 Low, fixed in 3.5.11). Musical Chairs uses PostgreSQL, so the MariaDB driver is never loaded.

Everything else is Debian or Red Hat findings with no fix yet, which 0129 already accepted. The frontend's production packages and the backup service's Python packages had none.

## Options considered
| Finding | Options | Choice |
|---|---|---|
| `dnspython` | update to 2.9.2 / accept, since it can't be reached | **Update.** One line of `backend/uv.lock`. *(The owner's choice: fix everything fixable)* |
| PostGIS | move to `18-3.7` / stay on `18-3.6` | **Move to `18-3.7`.** It stays as published (0097). Every 1.0.0 installation is new, so no database needs upgrading. *(The owner's choice)* |
| What `18-3.7` still has | our own thin PostGIS image, with Debian's fixes and gosu rebuilt / Debian's fixes only / accept | **Accept for 1.0.0.** An image of our own would reverse 0097 and add a fifth image to build, scan and keep current, for flaws that are unreachable (gosu) or wait for PostGIS's next build. *(The owner's choice)* |
| Keycloak's jars | wait for a Keycloak patch / swap Guava and the MariaDB driver / swap all six | **Wait**, as 0129 chose for Guava. `musical-chairs-keycloak` follows the `26.8` tag, so a fixed patch arrives with the next build. Swapping jars makes our Keycloak differ from the one Keycloak tested, and the OpenTelemetry API must match Keycloak's other OpenTelemetry jars. *(The owner's choice)* |

## Decision
1. **1.0.0 ships `dnspython` 2.9.2 and `postgis/postgis:18-3.7`**, in a new release candidate, `v1.0.0-rc.2`. *(The owner's choice)*
2. **Accepted until upstream fixes them:** gosu's Go findings and the four Debian ones in `postgis/postgis:18-3.7`, and the six jar findings in Keycloak 26.8.2, besides 0129's list. *(The owner's choice)*
3. **Before the owner approves a release's publish step, a Claude Code session reads the run:** each job's result, the checks and browser tests that ran, the version and its notes, and every finding, compared with 0129 and this record. It brings the owner only what's new or newly fixable, each with a recommendation. The owner decides to fix or accept each one, and accepted ones are recorded. A fix means a new release candidate. *(Claude's choice, from how rc.1 was checked)*
4. **The first release candidate of a release that changes how Musical Chairs is installed is tried by hand,** after it's published: the owner installs the bundle on a clean Linux host, following its `docs/install.md` as an operator would. 1.0.0 is the first. *(Claude's choice)*

## Consequences
- The [releasing guide](../guides/releasing.md) says who checks what (points 3 and 4).
- `v1.0.0` goes on the commit of the last good release candidate.
- A database made under PostGIS 3.6, such as the dev stack's and the demo's, keeps working on the 3.7 image: tried on a throwaway volume. Its `postgis` extension stays at 3.6.4 until `ALTER EXTENSION postgis UPDATE`. A later release that moves PostGIS needs `musical-chairs upgrade` to run that on existing installations; nothing does yet.
- **Look again** when PostGIS publishes a build with a newer gosu or with Debian's `zstd` and `passwd` fixes, and when a Keycloak patch updates Guava, the OpenTelemetry API or the MariaDB driver. The scan shows each.
- Dependabot can close a bump without anyone moving the image, as it did for PostGIS. Each release's scan is where that shows.
