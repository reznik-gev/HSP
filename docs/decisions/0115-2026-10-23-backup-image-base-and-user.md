# 0115 — The backup image: Python's slim image with PostgreSQL 18's client, running as uid 999

- **Date:** 2026-10-23
- **Status:** Accepted

## Context
[0106](0106-2026-10-21-backups.md) (point 1) says `hsp-backup` is built "on the PostgreSQL 18 client image". When the image was written in #107, it was built differently, and it runs as a user no record names. Review of #107 asked for a record. This refines 0106; the rest of 0106 stands.

## Options considered
| Choice | Options | Chosen | Why |
|---|---|---|---|
| Base image | PostgreSQL 18's image, with Python added / **`python:3.14-slim`, with PostgreSQL 18's client added** | **`python:3.14-slim`** (owner approved) | It's the image the API is built on ([0097](0097-2026-10-18-production-images.md)), with the Python version everything else uses ([0091](0091-2026-10-15-python-3-14.md)). PostgreSQL's image has no Python, so 3.14 would have to be built into it. |
| Where `pg_dump` comes from | Debian's packages / **the PostgreSQL project's own Debian repository** (`apt.postgresql.org`) | **The PostgreSQL project's repository** (owner approved) | `pg_dump` must be at least the server's version, PostgreSQL 18 (`postgis/postgis:18`). Debian's packages are older. The project's repository has exactly `postgresql-client-18`, signed with its key, for arm64 too. |
| The user it runs as | A user of its own / **uid 999, the same as the `postgres` container** | **uid 999** (owner approved) | It must read `secrets/db_superuser_password`, which belongs to 999 ([0099](0099-2026-10-18-production-compose.md)), and own the backups folder under `HSP_DATA_DIR`. A user of its own would need that file shared between two owners. |

## Decision
- The backup image is built on **`python:3.14-slim`**, with **`postgresql-client-18`** from the PostgreSQL project's Debian repository.
- It runs as **uid 999**, not root, like the `postgres` container.

## Consequences
- Dependabot updates the Python base, as for the API's image. The client follows PostgreSQL 18's minor releases each time the image is built.
- Moving to a new PostgreSQL major version means changing the client package here, along with the server image.
- The backups folder and the superuser's password file must both belong to 999. `hsp install` ([0107](0107-2026-10-21-operator-cli.md)) sets that up.
