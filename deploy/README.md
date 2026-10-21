# Deployment

How HSP is packaged and run outside development. For local development, see the [main README](../README.md) (`compose.dev.yml`).

## Production images
HSP ships four images, all amd64, all running as non-root and configured only through environment variables ([0097](../docs/decisions/0097-2026-10-18-production-images.md)):

| Image | Built from | What it is |
|---|---|---|
| `hsp-api` | [`backend/Dockerfile`](../backend/Dockerfile) | The API on port 8000 (`HSP_API_WORKERS` uvicorn workers, default 4). Also runs the one-shot migrate job: `alembic upgrade head`. |
| `hsp-web` | [`web/Dockerfile`](web/Dockerfile) + the frontend | HSP's single entry point: nginx with the built frontend, routing `/api/` to the API and `/auth/` to Keycloak ([0098](../docs/decisions/0098-2026-10-18-web-entry-point.md)). HTTP on 8080, HTTPS on 8443, health on 8081 (`/healthz`, never published). |
| `hsp-keycloak` | [`keycloak/Dockerfile`](keycloak/Dockerfile) | Keycloak, pre-built for PostgreSQL and the `/auth` path, started with `start --optimized --import-realm`. Imports the `hsp` realm on first start, filling `${HSP_PUBLIC_URL}` and `${HSP_OIDC_CLIENT_SECRET}` from the environment. |
| `hsp-backup` | [`backup/Dockerfile`](backup/Dockerfile) | The backup service ([`backup/`](../backup/README.md)) with PostgreSQL 18's client tools, as uid 999 like `postgres`. Runs `hsp-backup serve`. |

PostgreSQL is the published `postgis/postgis` image.

### `hsp-web` settings
| Variable | Default | Meaning |
|---|---|---|
| `HSP_WEB_TLS` | `on` | `on`: `hsp-web` terminates TLS; HTTP redirects to HTTPS. `off`: a proxy or load balancer in front terminates TLS, and `hsp-web` serves HTTP on 8080. |
| `HSP_PUBLIC_URL` | (none) | Where users reach HSP, e.g. `https://hsp.example.com`. Required when TLS is on (the redirect goes there). |
| `HSP_TLS_CERT`, `HSP_TLS_KEY` | `/etc/hsp/tls/tls.crt`, `.key` | Certificate (with its chain) and key files, mounted into the container. |
| `HSP_HSTS` | `on` | Send HSTS (1 year, this host only) when TLS is on. |
| `HSP_TRUSTED_PROXIES` | (none) | With TLS off: addresses or CIDRs of the proxy in front, whose `X-Forwarded-For` and `X-Forwarded-Proto` are trusted. |
| `HSP_KEYCLOAK_ADMIN_FROM` | (none) | Networks (CIDRs) allowed to open Keycloak's admin console at `/auth/admin`. Empty: nobody, through `hsp-web`. |
| `HSP_API_UPSTREAM`, `HSP_KEYCLOAK_UPSTREAM` | `api:8000`, `keycloak:8080` | Where the API and Keycloak are. |
| `HSP_RESOLVER` | `127.0.0.11` | DNS server for those names (Docker's; a cluster DNS on Kubernetes). |

Build and check them locally (Docker with BuildKit):
```bash
deploy/build-images.sh            # tagged 0.0.0-dev; or deploy/build-images.sh 1.2.0
deploy/smoke-images.sh            # starts each image and checks it answers
```
CI runs both on every PR that touches the app or the images; nothing is pushed anywhere.

## The production stack
[`compose/compose.yml`](compose/compose.yml) runs HSP on one host ([0055](../docs/decisions/0055-2026-10-08-deployment-target.md), [0099](../docs/decisions/0099-2026-10-18-production-compose.md)): `postgres`, a one-shot `migrate`, `api`, `keycloak` and `web`. `web` publishes the ports users reach; `api` publishes only its metrics port, to this host by default (see [Monitoring](#monitoring)).

`hsp install` sets an installation up from a release bundle and starts it; that is the one supported way ([0107](../docs/decisions/0107-2026-10-21-operator-cli.md)). In the installation folder (`/opt/hsp` by default) it writes `compose.yml`, `postgres-init/`, `.env` and `backups.yml` from the bundle's `compose/`; generates the secrets in `secrets/` (each readable by the containers that mount it, inside a folder only root can open); puts the TLS certificate and key in `tls/` (`tls.key` readable by nginx's uid 101); makes `HSP_DATA_DIR/backups` belong to the backup service's uid 999; starts the stack, waiting until every service is healthy; and creates the first admin. Operators read about it in [install.md](install.md); its code is [`bin/hsp`](bin/hsp).

## Monitoring
What HSP gives you to watch it ([0057](../docs/decisions/0057-2026-10-08-observability.md), [0105](../docs/decisions/0105-2026-10-21-metrics-and-tracing.md)):

- **Logs:** every service logs to Docker (`docker compose logs`). The API writes JSON lines, one per request, with the route, status, `duration_ms`, `request_id` and the user's Keycloak subject. `HSP_LOG_LEVEL=DEBUG` adds the full path.
- **Readiness:** `api`'s health check is `/readyz`. It's ready when the database answers, its schema matches this version, and Keycloak answers. `docker compose ps` shows it.
- **Metrics:** Prometheus metrics on `HSP_METRICS_ADDRESS:HSP_API_METRICS_PORT`, `127.0.0.1:9464` by default, so only this host can scrape them. To scrape from another machine, set `HSP_METRICS_ADDRESS` to an internal interface's address, and keep that port closed to users. They include requests by route (`hsp_http_requests_total`, `hsp_http_request_duration_seconds`), database connections in use, changesets and publishes (`hsp_plan_operations_total`), and edit-lock refusals. They hold no personal data. The API's CPU and memory come from Docker, not from these metrics: see `docker stats`, or run cAdvisor for graphs ([0111](../docs/decisions/0111-2026-10-23-cpu-and-memory-from-the-platform.md)).
- **Traces:** OpenTelemetry, off until you set `OTEL_EXPORTER_OTLP_ENDPOINT` in `.env` to your collector's OTLP/HTTP address. Requests and database queries are traced, as service `hsp-api` with the release version. By default 10% of requests are sampled; the standard `OTEL_TRACES_SAMPLER` and `OTEL_TRACES_SAMPLER_ARG` change that. Calls from the API to Keycloak aren't traced yet.
- **Backups:** the backup service's metrics are on `HSP_METRICS_ADDRESS:HSP_BACKUP_METRICS_PORT` (`127.0.0.1:9465`), per schedule: `hsp_backup_last_success_timestamp_seconds`, `hsp_backup_last_failure_timestamp_seconds`, `hsp_backup_duration_seconds` and `hsp_backup_size_bytes`. Alert when the last success is too old, e.g. `time() - hsp_backup_last_success_timestamp_seconds > 26 * 3600` for a nightly schedule.

## Backups
The `backup` service backs up HSP's and Keycloak's databases on the schedules in `backups.yml`, to a folder or to S3 ([0058](../docs/decisions/0058-2026-10-08-backups.md), [0106](../docs/decisions/0106-2026-10-21-backups.md)). [`backups.example.yml`](compose/backups.example.yml) explains every setting; by default it keeps 7 nightly and 4 weekly backups in `HSP_DATA_DIR/backups`.

- **Each backup is one file**, `hsp-<UTC time>-<schedule>.tar`: both databases, the HSP version and checksums, and with `include_config` the installation's `.env`, `backups.yml` and `compose.yml`. Never `secrets/`: keep a copy of those somewhere safe yourself.
- **Backups hold personal data** (names, emails, seats). Keep the target encrypted and its access limited.
- **Change the schedules** in `backups.yml`, check them with `docker compose exec backup hsp-backup check`, and apply them with `docker compose restart backup`.
- **S3:** add a target with `type: s3`, and put the keys in `secrets/backup_s3_access_key` and `secrets/backup_s3_secret_key`.
- **By hand:** `sudo hsp backup now` takes one, and `sudo hsp backup list` lists them all.
- **Restore:** `sudo hsp restore hsp-20261021T023000Z-nightly.tar` replaces both databases with that backup. Everything changed since is lost, and HSP is down while it runs. A backup made by a newer HSP than the one installed is refused.

## The release bundle
Each release is one file, `hsp-<version>.tar.gz`, on the repository's GitHub Releases page ([0054](../docs/decisions/0054-2026-10-08-release-distribution.md), [0102](../docs/decisions/0102-2026-10-19-release-workflow.md)). It holds everything an installation needs, and no registry is contacted:

| Path | What |
|---|---|
| `images/` | One `docker save` file per image the stack runs: `hsp-api`, `hsp-web`, `hsp-keycloak`, `hsp-backup` and PostGIS |
| `compose/` | `compose.yml`, `postgres-init/`, `.env.example` (with `HSP_VERSION` already set) and `backups.example.yml` |
| `docs/` | This guide (`install.md`), this release's notes and the full changelog |
| `bin/hsp` | The operator's command (see [`bin/hsp`](#binhsp)) |
| `LICENSE`, `VERSION` | The licence, and the version |
| `SHA256SUMS` | A checksum for every file above |

To install from it:
```bash
sha256sum -c hsp-<version>.tar.gz.sha256      # the file next to the bundle on the Releases page
tar -xzf hsp-<version>.tar.gz
sudo ./hsp-<version>/bin/hsp install          # asks for the public URL, TLS and the first admin
```
How releases are made: [docs/guides/releasing.md](../docs/guides/releasing.md).

## `bin/hsp`
The operator's command, on the Docker host ([0107](../docs/decisions/0107-2026-10-21-operator-cli.md)). `hsp install` copies it to `<installation>/bin/hsp`. From another machine, Windows included, run it over SSH: `ssh admin@hsp-host sudo /opt/hsp/bin/hsp status`.

| Command | What it does |
|---|---|
| `hsp install [bundle] [options]` | Checks the bundle's checksums, loads its images, writes the installation (default `/opt/hsp`): `.env`, `backups.yml`, generated secrets, and TLS files (yours with `--tls-cert`/`--tls-key`, or a self-signed certificate to try it out). Then starts HSP, waits until every service is healthy, and creates the first admin with a one-time password. `hsp install --help` lists the options for a scripted install, such as `--public-url`, `--tls` and `--set NAME=VALUE`. |
| `hsp status` | The version, each service's state and health, the last backup of each schedule and any failure since, and free disk. |
| `hsp backup now` / `hsp backup list` | Takes a backup now, to `backups.yml`'s `manual` target, and prints its name; lists every backup on every target, newest first. |
| `hsp upgrade [bundle]` | Upgrades to a release: run the **new** release's own hsp, `sudo ./hsp-<new>/bin/hsp upgrade` (`--dir` if the installation isn't in `/opt/hsp`). It refuses a downgrade or skipping a MAJOR, takes a pre-upgrade backup (and stops if that fails), keeps the previous release's files, migrates and starts the new one, and waits until it's healthy. `.env` keeps every value you set; new settings get their defaults, and are listed. `backups.yml` isn't touched. HSP is down for a few minutes. Old images are kept; `docker image prune -a` removes unused ones. |
| `hsp rollback` | Undoes the last upgrade: the previous release's files and images, and its data from the pre-upgrade backup. Everything changed since the upgrade is lost. |
| `hsp restore <backup>` | Replaces both databases with a backup, after you confirm (`--yes` in scripts). It stops HSP, restores, starts it again and waits until it's healthy. A backup from a newer HSP is refused. |

