# 0099 — The production Compose stack: secrets, data and how it's wired

- **Date:** 2026-10-18
- **Status:** Accepted
- **Refines:** [0055](0055-2026-10-08-deployment-target.md), [0056](0056-2026-10-08-upgrades-and-migrations.md), [0058](0058-2026-10-08-backups.md)

## Context
[0055](0055-2026-10-08-deployment-target.md) chose Docker Compose on one host. [0097](0097-2026-10-18-production-images.md) and [0098](0098-2026-10-18-web-entry-point.md) built the images. This record decides how the production Compose file runs them. The owner chose the three main points; details marked *(Claude's choice)* are lower-confidence.

## Decisions

| Question | Options | Chosen | Why |
|---|---|---|---|
| Where secrets live | **Secret files** / all in `.env` | **One file per secret in `secrets/`, given to containers as Compose secrets** | Secrets never show in `docker inspect` or a process's environment, and a backup can leave the folder out ([0058](0058-2026-10-08-backups.md)). Non-secret settings stay in `.env`. The API reads secret files from `/run/secrets` (pydantic-settings). PostgreSQL reads `*_FILE` variables itself, and `hsp-keycloak` gets a small entrypoint that does the same. |
| Where data lives | **A host folder, configurable** / Docker named volumes | **Bind mounts under `HSP_DATA_DIR`** (default `/var/lib/hsp`) | Operators can see the data, put it on its own disk, include it in their host backups and watch its size, and `docker compose down -v` can't delete it. PostgreSQL's files are in `postgres/`; backups will be in `backups/`. |
| Testing the whole stack in CI | Stack smoke on PRs / plus nightly browser tests / **only in the release workflow** | **Only when a release is built** | PRs stay fast. The release workflow (the offline-archive step) brings up the stack from the bundle it builds and checks it before publishing. Wiring mistakes are found then, at the latest. |

### Details *(Claude's choice)*
- **The installation directory** holds `compose.yml`, `.env`, `secrets/`, `tls/` and `postgres-init/`. `hsp install` will prepare it ([0054](0054-2026-10-08-release-distribution.md)). Each secret file must be readable by its container's user (the API runs as uid 10001, Keycloak as 1000, PostgreSQL as 999); the install sets the owners.
- **Six secrets:** the PostgreSQL superuser's password, the passwords of HSP's and Keycloak's own database roles, Keycloak's first admin's password, the session encryption key and the OIDC client secret.
- **Database roles:** the superuser is only for setup and maintenance. HSP and Keycloak each connect with their own role, which owns its database. A script run on the first start of an empty data directory creates the roles and databases, and the PostGIS and `btree_gist` extensions, which only a superuser may create.
- **The database password is a separate setting** (`HSP_DATABASE_PASSWORD`, read from its secret file). `HSP_DATABASE_URL` holds no password, so it can be plain config.
- **Migrations:** the `migrate` service (the `hsp-api` image running `alembic upgrade head`) runs before the API starts, and the API waits for it to finish successfully. The API still never migrates by itself ([0056](0056-2026-10-08-upgrades-and-migrations.md)). `hsp upgrade` takes its backup before starting the new version, so the migration runs after the backup.
- **The API talks to Keycloak inside the stack** (`http://keycloak:8080`), not through the public address. Keycloak keeps its public URL as the issuer (`KC_HOSTNAME`, with `KC_HOSTNAME_BACKCHANNEL_DYNAMIC`), so ID tokens are still checked against the public issuer. This avoids the API reaching itself through `hsp-web`, the company's DNS or a self-signed certificate.
- **Keycloak is told it's behind a proxy** (`KC_PROXY_HEADERS=xforwarded`), and `hsp-web` is the only service with published ports. `HSP_BIND_ADDRESS`, `HSP_HTTP_PORT` and `HSP_HTTPS_PORT` set where they're published.
- **Images are never pulled** (`pull_policy: never`): they come from the release bundle.
- **Every service restarts unless stopped**, and has a health check: `pg_isready`, the API's `/readyz`, Keycloak's management port and `hsp-web`'s `/healthz`.
- **Container logs rotate**: json-file, 5 files of 10 MB per container.
- **uvicorn's own access log is off.** `hsp-web` logs every request as JSON with its request id ([0098](0098-2026-10-18-web-entry-point.md)). uvicorn's plain-text copy would also record sign-in codes from callback URLs.

## Consequences
- Preparing an installation (secrets, owners, certificate, data folder) is a job for `hsp install`. By hand, it's the steps in `deploy/README.md`.
- No first HSP admin user exists after the first start. `hsp install` will create it in Keycloak.
- A wiring problem that only appears with all services together is found when a release is built, not in the PR that causes it.
