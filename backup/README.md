# hsp-backup

HSP's backup service ([0058](../docs/decisions/0058-2026-10-08-backups.md), [0106](../docs/decisions/0106-2026-10-21-backups.md)). It runs as the `backup` service in the Compose stack. On the schedules in `backups.yml`, it dumps HSP's and Keycloak's databases, writes them to a folder or to S3, and deletes old backups. It also restores them. Operators use it through `hsp backup` and `hsp restore` ([0107](../docs/decisions/0107-2026-10-21-operator-cli.md)).

## Commands
| Command | What it does |
|---|---|
| `hsp-backup serve` | Runs the schedules, and serves metrics on port 9465 |
| `hsp-backup check` | Checks `backups.yml` and says what's wrong |
| `hsp-backup now [--schedule manual]` | Takes a backup now |
| `hsp-backup list [--json]` | Lists the backups on every target |
| `hsp-backup restore <name> --yes` | Replaces both databases with a backup. The stack must be stopped, except `postgres`. |
| `hsp-backup prune [--schedule pre-upgrade] [--keep 1]` | Deletes a schedule's backups beyond the newest `--keep`. `hsp upgrade` runs it after a successful upgrade. |

## Settings
| Variable | Default | What |
|---|---|---|
| `HSP_BACKUP_CONFIG` | `/etc/hsp/backups.yml` | The schedules and targets |
| `HSP_BACKUP_INSTALL_DIR` | `/etc/hsp/install` | Where `.env`, `backups.yml` and `compose.yml` are, for `include_config` |
| `HSP_VERSION` | | The installed release, written into each backup and checked on restore |
| `PGHOST`, `PGUSER`, `PGPASSWORD_FILE` | `postgres`, `postgres`, `/run/secrets/db_superuser_password` | The PostgreSQL superuser |
| `HSP_BACKUP_SECRETS_DIR` | `/run/secrets` | Where `backup_s3_access_key` and `backup_s3_secret_key` are |

## Development
```bash
uv sync
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
```
The tests need no database: `pg_dump` and `pg_restore` are faked, and S3 is faked with moto. The weekly restore test runs everything for real ([0106](../docs/decisions/0106-2026-10-21-backups.md)).
