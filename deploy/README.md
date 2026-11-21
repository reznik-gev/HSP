# Deployment

How Musical Chairs is packaged and run outside development: the images, the stack, the bundle and `bin/musical-chairs`, for people working on Musical Chairs. **To install and run Musical Chairs, read [install.md](install.md)**: it ships in every bundle as `docs/install.md`. For local development, see the [main README](../README.md) (`compose.dev.yml`).

## Production images
Musical Chairs ships four images, all amd64, all running as non-root and configured only through environment variables ([0097](../docs/decisions/0097-2026-10-18-production-images.md)):

| Image | Built from | What it is |
|---|---|---|
| `musical-chairs-api` | [`backend/Dockerfile`](../backend/Dockerfile) | The API on port 8000 (`MUSICAL_CHAIRS_API_WORKERS` uvicorn workers, default 4). Also runs the one-shot migrate job: `alembic upgrade head`. |
| `musical-chairs-web` | [`web/Dockerfile`](web/Dockerfile) + the frontend | Musical Chairs' single entry point: nginx with the built frontend, routing `/api/` to the API and `/auth/` to Keycloak ([0098](../docs/decisions/0098-2026-10-18-web-entry-point.md)). HTTP on 8080, HTTPS on 8443, health on 8081 (`/healthz`, never published). |
| `musical-chairs-keycloak` | [`keycloak/Dockerfile`](keycloak/Dockerfile) | Keycloak, pre-built for PostgreSQL and the `/auth` path, started with `start --optimized --import-realm`. Imports the `musical-chairs` realm on first start, filling `${MUSICAL_CHAIRS_PUBLIC_URL}` and `${MUSICAL_CHAIRS_OIDC_CLIENT_SECRET}` from the environment. |
| `musical-chairs-backup` | [`backup/Dockerfile`](backup/Dockerfile) | The backup service ([`backup/`](../backup/README.md)) with PostgreSQL 18's client tools, as uid 999 like `postgres`. Runs `musical-chairs-backup serve`. |

PostgreSQL is the published `postgis/postgis` image.

### `musical-chairs-web` settings
| Variable | Default | Meaning |
|---|---|---|
| `MUSICAL_CHAIRS_WEB_TLS` | `on` | `on`: `musical-chairs-web` terminates TLS; HTTP redirects to HTTPS. `off`: a proxy or load balancer in front terminates TLS, and `musical-chairs-web` serves HTTP on 8080. |
| `MUSICAL_CHAIRS_PUBLIC_URL` | (none) | Where users reach Musical Chairs, e.g. `https://musical-chairs.example.com`. Required when TLS is on (the redirect goes there). |
| `MUSICAL_CHAIRS_TLS_CERT`, `MUSICAL_CHAIRS_TLS_KEY` | `/etc/musical_chairs/tls/tls.crt`, `.key` | Certificate (with its chain) and key files, mounted into the container. |
| `MUSICAL_CHAIRS_HSTS` | `on` | Send HSTS (1 year, this host only) when TLS is on. |
| `MUSICAL_CHAIRS_TRUSTED_PROXIES` | (none) | With TLS off: addresses or CIDRs of the proxy in front, whose `X-Forwarded-For` and `X-Forwarded-Proto` are trusted. |
| `MUSICAL_CHAIRS_KEYCLOAK_ADMIN_FROM` | (none) | Networks (CIDRs) allowed to open Keycloak's admin console at `/auth/admin`. Empty: nobody, through `musical-chairs-web`. |
| `MUSICAL_CHAIRS_API_UPSTREAM`, `MUSICAL_CHAIRS_KEYCLOAK_UPSTREAM` | `api:8000`, `keycloak:8080` | Where the API and Keycloak are. |
| `MUSICAL_CHAIRS_RESOLVER` | `127.0.0.11` | DNS server for those names (Docker's; a cluster DNS on Kubernetes). |

Build and check them locally (Docker with BuildKit):
```bash
deploy/build-images.sh            # tagged 0.0.0-dev; or deploy/build-images.sh 1.2.0
deploy/smoke-images.sh            # starts each image and checks it answers
deploy/scan-images.sh             # lists known vulnerabilities in every image the stack runs
deploy/audit-packages.sh          # the same for the Python and frontend production packages
```
CI runs the first three on every PR that touches the app or the images; nothing is pushed anywhere. The two scans only warn ([0128](../docs/decisions/0128-2026-11-08-vulnerability-scanning.md)): they list what they find and fail only when a scanner can't run. `scan-images.sh` runs Trivy from its own image, pinned in [`trivy/Dockerfile`](trivy/Dockerfile), and needs Docker and jq; `audit-packages.sh` needs uv, pnpm and jq, and CI runs it when a dependency file changes. The release workflow runs both.

## The production stack
[`compose/compose.yml`](compose/compose.yml) runs Musical Chairs on one host ([0055](../docs/decisions/0055-2026-10-08-deployment-target.md), [0099](../docs/decisions/0099-2026-10-18-production-compose.md)): `postgres`, a one-shot `migrate`, `api`, `keycloak`, `backup` and `web`. `web` publishes the ports users reach; `api` publishes only its metrics port, to this host by default (see [Monitoring and backups](#monitoring-and-backups)).

`musical-chairs install` sets an installation up from a release bundle and starts it; that is the one supported way ([0107](../docs/decisions/0107-2026-10-21-operator-cli.md)). In the installation folder (`/opt/musical_chairs` by default) it writes `compose.yml`, `postgres-init/`, `.env` and `backups.yml` from the bundle's `compose/`; generates the secrets in `secrets/` (each readable by the containers that mount it, inside a folder only root can open); puts the TLS certificate and key in `tls/` (`tls.key` readable by nginx's uid 101); makes `MUSICAL_CHAIRS_DATA_DIR/backups` belong to the backup service's uid 999; starts the stack, waiting until every service is healthy; and creates the first admin. Operators read about it in [install.md](install.md); its code is [`bin/musical-chairs`](bin/musical-chairs).

## Monitoring and backups
For operators, in [install.md](install.md): logs, `/readyz`, metrics on ports 9464 and 9465 (host-only by default), tracing, and the `backup` service with `backups.yml` ([0105](../docs/decisions/0105-2026-10-21-metrics-and-tracing.md), [0106](../docs/decisions/0106-2026-10-21-backups.md)). The backup program itself is in [`backup/`](../backup/README.md); the weekly restore test is `test-restore.sh` (see [testing.md](../docs/guides/testing.md)).

## The release bundle
Each release is one file, `musical-chairs-<version>.tar.gz`, on the repository's GitHub Releases page ([0054](../docs/decisions/0054-2026-10-08-release-distribution.md), [0102](../docs/decisions/0102-2026-10-19-release-workflow.md)). It holds everything an installation needs, and no registry is contacted:

| Path | What |
|---|---|
| `images/` | One `docker save` file per image the stack runs: `musical-chairs-api`, `musical-chairs-web`, `musical-chairs-keycloak`, `musical-chairs-backup` and PostGIS |
| `compose/` | `compose.yml`, `postgres-init/`, `.env.example` (with `MUSICAL_CHAIRS_VERSION` already set) and `backups.example.yml` |
| `docs/` | The operator guide, [`install.md`](install.md); this release's notes and the full changelog |
| `bin/musical-chairs` | The operator's command (see [`bin/musical-chairs`](#binmusical-chairs)) |
| `LICENSE`, `VERSION` | The licence, and the version |
| `SHA256SUMS` | A checksum for every file above |

To install from it:
```bash
sha256sum -c musical-chairs-<version>.tar.gz.sha256      # the file next to the bundle on the Releases page
tar -xzf musical-chairs-<version>.tar.gz
sudo ./musical-chairs-<version>/bin/musical-chairs install          # asks for the public URL, TLS and the first admin
```
How releases are made: [docs/guides/releasing.md](../docs/guides/releasing.md).

## `bin/musical-chairs`
The operator's command, [`bin/musical-chairs`](bin/musical-chairs): one bash script, shipped in the bundle and copied into each installation by `musical-chairs install` ([0107](../docs/decisions/0107-2026-10-21-operator-cli.md)). Its commands (`install`, `status`, `backup`, `restore`, `upgrade`, `rollback`) are described for operators in [install.md](install.md). It needs only bash, Docker with Compose, and openssl; anything with real logic runs in Musical Chairs' images. CI checks it with shellcheck; `test-bundle.sh` installs with it, `test-restore.sh` backs up and restores with it, and `test-upgrade.sh` upgrades and rolls back with it (the release workflow, from the last release).
