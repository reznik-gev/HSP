# hsp-backup

HSP's backup service ([0058](../docs/decisions/0058-2026-10-08-backups.md), [0106](../docs/decisions/0106-2026-10-21-backups.md)). It runs as the `backup` service in the Compose stack. On the schedules in `backups.yml`, it dumps HSP's and Keycloak's databases, writes them to a folder or to S3, and deletes old backups. It also restores them. Operators use it through `hsp backup` and `hsp restore` ([0107](../docs/decisions/0107-2026-10-21-operator-cli.md)).

## Commands
| Command | What it does |
|---|---|
| `hsp-backup serve` | Runs the schedules, and serves metrics on port 9465 |
| `hsp-backup check` | Checks `backups.yml` and says what's wrong, or what each schedule keeps |
| `hsp-backup now [--schedule manual]` | Takes a backup now |
| `hsp-backup list [--json]` | Lists the backups on every target |
| `hsp-backup restore <name> --yes` | Replaces both databases with a backup. The stack must be stopped, except `postgres`. |
| `hsp-backup prune [--schedule pre-upgrade] [--keep 1]` | Deletes a schedule's backups beyond the newest `--keep`. `hsp upgrade` runs it after a successful upgrade. |

## backups.yml
```yaml
timezone: Asia/Jerusalem
targets:
  local:   { type: folder, path: /backups }
  offsite: { type: s3, endpoint: https://minio.corp:9000, bucket: hsp-backups, prefix: prod/ }
schedules:
  - { name: nightly, cron: "30 2 * * *", target: local, keep: 7 }
manual: { target: local, keep: 5 }
```
- **Schedules** run at their cron times, in `timezone`. Schedules due at the same moment run one after another. One that comes due while a backup is still running is skipped, logged and recorded in the metrics, and waits for its next time. A failed backup isn't retried; the next one runs as usual.
- **Old backups** are deleted per schedule after each backup: all but the newest `keep`. With `keep_days`, backups younger than that are kept too, whichever keeps more. Every schedule must set `keep`; `keep_days` is optional. Age comes from the time in a backup's name, never from file dates.
- **Manual backups** keep the newest `manual.keep`. Pre-upgrade backups stay until `hsp upgrade` succeeds.

## Metrics
On port 9465, for each schedule: when it last succeeded, failed or was skipped, and the last backup's duration and size. Alerting is the operator's Prometheus, for example `time() - hsp_backup_last_success_timestamp_seconds > 26 * 3600`.

## What a backup holds
Each backup is one tar file, named `hsp-<UTC time>-<schedule>.tar`:

| File | What |
|---|---|
| `manifest.json` | The HSP version, the database schema's revision, the time, the schedule, and every other file's SHA-256 |
| `hsp.dump`, `keycloak.dump` | The two databases, from `pg_dump --format=custom`, already compressed |
| `config/.env`, `config/backups.yml`, `config/compose.yml` | With `include_config`, and always in manual and pre-upgrade backups. Never `secrets/`. |

The tar itself isn't compressed, because the dumps already are. A restore checks every file against its SHA-256 first.

## Settings
| Variable | Default | What |
|---|---|---|
| `HSP_BACKUP_CONFIG` | `/etc/hsp/backups.yml` | The schedules and targets |
| `HSP_BACKUP_INSTALL_DIR` | `/etc/hsp/install` | Where `.env`, `backups.yml` and `compose.yml` are, for `include_config` |
| `HSP_VERSION` | | The installed release, written into each backup and checked on restore |
| `PGHOST`, `PGUSER`, `PGPASSWORD_FILE` | `postgres`, `postgres`, `/run/secrets/db_superuser_password` | The PostgreSQL superuser, who can dump and restore both databases with their owners |
| `HSP_BACKUP_SECRETS_DIR` | `/run/secrets` | Where `backup_s3_access_key` and `backup_s3_secret_key` are |

## Development
```bash
uv sync
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
```
The tests need no database: `pg_dump` and `pg_restore` are faked, and S3 is faked with moto. The weekly restore test runs everything for real ([0106](../docs/decisions/0106-2026-10-21-backups.md)).
