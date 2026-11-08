# 0129 — What to do about the first scan's findings

- **Date:** 2026-11-08
- **Status:** Accepted
- **Refines:** [0097](0097-2026-10-18-production-images.md) (the images)
- **Relates to:** [0128](0128-2026-11-08-vulnerability-scanning.md) (the scan)

## Context
The first vulnerability scan ([0128](0128-2026-11-08-vulnerability-scanning.md), [#143](https://github.com/reznik-gev/HSP/pull/143)) found nothing in HSP's own Python packages. It did find:
- two moderate advisories in a frontend package, seroval;
- High and Critical advisories in the images, most of them in Debian packages with no fix yet.

The ones that have a fix, or come from code we don't use, were taken to the owner one at a time.

## Decision
The owner's choices:

| Finding | Options | Choice |
|---|---|---|
| **seroval 1.6.8** (frontend, through `@tanstack/react-router`): 2 moderate | update to 1.7.10, released a day earlier / pin 1.6.12 with a lasting `pnpm` override / leave it for Dependabot | **Update to 1.7.10.** Only the lock file changes, as Dependabot's own PR would. The router allows 1.7. |
| **pip in the Python base image** (`hsp-api`, `hsp-backup`): its bundled msgpack, urllib3 and setuptools, 5 High | remove pip / keep it until the Python image ships a newer one | **Remove pip** from both images' final stage. HSP never runs it: the app is in `/app/.venv`, built by uv. Nobody can `pip install` inside a running container any more. |
| **Debian fixes the base images don't have yet**: zlib (2 High, every Debian image), brotli (Critical) and apt (High) in `hsp-web` | `apt-get upgrade` at build time / wait for the base images | **Upgrade at build time** in `hsp-api`, `hsp-backup` and `hsp-web`. Each build then carries every Debian fix published so far. Builds of one commit can differ a little more than they already do (the base tags move, 0097). `hsp-keycloak` can't do this: its base has no package manager. |
| **PostGIS's `gosu`**, built with Go 1.24.6: 1 Critical and about 20 High in Go's standard library | accept and record / build our own patched PostGIS image / switch to the Alpine variant | **Accept and record.** PostGIS stays as published (0097). gosu runs only for a moment at start-up, to switch from root to the postgres user. It does no networking and reads no untrusted input, so these flaws can't be reached. PostGIS 18-3.7 ships the same gosu. |
| **Guava 33.6.0 inside Keycloak**: 1 High, fixed in Guava 33.7.2 | wait for Keycloak / swap the jar in our build | **Wait for Keycloak.** Even Keycloak 26.8.2 (2026-11-05) has the old Guava. `hsp-keycloak` follows the `26.8` tag, so the first Keycloak patch with the fix arrives in our next build on its own. |

Also accepted until upstream fixes them: the Debian findings with no fix yet in every image, and PostGIS's MariaDB client libraries (2 Critical) and libxml2 (Critical). None of these have a fix to install.

## Consequences
- The fixable findings in our own images are cleared. What's left are findings with no fix yet, plus PostGIS's gosu and Keycloak's Guava, which wait for their upstream images.
- The scan keeps warning about the accepted findings. Nothing marks them as accepted, so whoever reads a release's summary needs this record to tell old findings from new ones.
- **Look again** when a PostGIS image ships a gosu built with a newer Go, and when a Keycloak release updates Guava. The scan shows both.
