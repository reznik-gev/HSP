"""`hsp-backup`: the backup service's commands (docs/0106). `bin/hsp` runs them inside the
backup container (docs/0107)."""

import argparse
import json
import logging
import os
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import cache
from pathlib import Path

from prometheus_client import REGISTRY, start_http_server

from hsp_backup.archive import ArchiveError
from hsp_backup.backups import Backups, RestoreRefused
from hsp_backup.config import MANUAL, PRE_UPGRADE, BackupConfig, ConfigError, load_config
from hsp_backup.metrics import PORT, BackupMetrics
from hsp_backup.postgres import PgTools, PostgresError
from hsp_backup.scheduler import Scheduler
from hsp_backup.stores import Store, StoreError, open_store

log = logging.getLogger("hsp_backup")

#: Failures an operator can act on: said in one line, without a traceback.
EXPECTED = (ConfigError, StoreError, RestoreRefused, ArchiveError, PostgresError)


@dataclass(frozen=True)
class Settings:
    config: Path
    install_dir: Path
    hsp_version: str
    pg_host: str
    pg_user: str
    pg_password_file: Path
    secrets_dir: Path

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> Settings:
        return cls(
            config=Path(env.get("HSP_BACKUP_CONFIG", "/etc/hsp/backups.yml")),
            install_dir=Path(env.get("HSP_BACKUP_INSTALL_DIR", "/etc/hsp/install")),
            hsp_version=env.get("HSP_VERSION", "0.0.0-dev"),
            pg_host=env.get("PGHOST", "postgres"),
            pg_user=env.get("PGUSER", "postgres"),
            pg_password_file=Path(env.get("PGPASSWORD_FILE", "/run/secrets/db_superuser_password")),
            secrets_dir=Path(env.get("HSP_BACKUP_SECRETS_DIR", "/run/secrets")),
        )


class JsonLines(logging.Formatter):
    """One JSON object per line, like the API's logs (docs/0057)."""

    _STANDARD = frozenset(vars(logging.makeLogRecord({})))

    def format(self, record: logging.LogRecord) -> str:
        line = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname.lower(),
            "event": record.getMessage(),
            **{k: v for k, v in vars(record).items() if k not in self._STANDARD},
        }
        return json.dumps(line, default=str)


def configure_logging() -> None:
    """Logs go to stderr, so a command's own output (a backup's name, list --json) stays clean
    for bin/hsp to read; Docker keeps both."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(JsonLines())
    log.handlers[:] = [handler]
    log.setLevel(logging.INFO)
    log.propagate = False


@cache
def process_metrics() -> BackupMetrics:
    """The metrics this process serves; registered once."""
    return BackupMetrics(REGISTRY)


def build(settings: Settings, config: BackupConfig) -> Backups:
    opened: dict[str, Store] = {}

    def store(label: str) -> Store:
        if label not in opened:
            opened[label] = open_store(label, config.targets[label], settings.secrets_dir)
        return opened[label]

    return Backups(
        config=config,
        postgres=PgTools(settings.pg_host, settings.pg_user, settings.pg_password_file),
        stores=store,
        hsp_version=settings.hsp_version,
        install_dir=settings.install_dir,
        metrics=process_metrics(),
    )


def cmd_check(backups: Backups, _: argparse.Namespace) -> int:
    config = backups.config
    for label in config.targets:
        backups.stores(label).names()  # can it be read?
    print(
        f"backups.yml is fine: {len(config.targets)} target(s), "
        f"{len(config.schedules)} schedule(s), and every target can be read"
    )
    return 0


def cmd_serve(backups: Backups, _: argparse.Namespace) -> int:
    start_http_server(PORT)
    log.info(
        "backup service started",
        extra={"schedules": [s.name for s in backups.config.schedules], "metrics_port": PORT},
    )
    Scheduler(backups.config, backups.take, backups.metrics, backups.clock).run_forever()
    return 0


def cmd_now(backups: Backups, args: argparse.Namespace) -> int:
    print(backups.take(args.schedule))
    return 0


def cmd_list(backups: Backups, args: argparse.Namespace) -> int:
    found = backups.list()
    if args.json:
        rows = [
            {
                "name": str(b),
                "target": label,
                "schedule": b.schedule,
                "created": b.created.isoformat(),
            }
            for label, b in found
        ]
        print(json.dumps(rows, indent=2))
    elif not found:
        print("No backups yet.")
    else:
        for label, b in found:
            print(f"{b}  {label}")
    return 0


def cmd_restore(backups: Backups, args: argparse.Namespace) -> int:
    if not args.yes:
        print(
            "hsp-backup: restoring replaces HSP's and Keycloak's databases. "
            "Stop the stack except postgres, then add --yes.",
            file=sys.stderr,
        )
        return 2
    manifest = backups.restore(args.name)
    print(f"Restored {args.name} (made by HSP {manifest.hsp_version}).")
    return 0


def cmd_prune(backups: Backups, args: argparse.Namespace) -> int:
    for name in backups.prune(args.schedule, keep=args.keep):
        print(f"deleted {name}")
    return 0


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="hsp-backup", description="HSP's backups (docs/0106).")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("serve", help="run the schedules, and serve metrics on port 9465")
    sub.add_parser("check", help="check backups.yml, and that every target can be read")
    now = sub.add_parser("now", help="take a backup now")
    now.add_argument(
        "--schedule", default=MANUAL, help="manual (the default), pre-upgrade, or a schedule"
    )
    lst = sub.add_parser("list", help="list the backups on every target")
    lst.add_argument("--json", action="store_true")
    restore = sub.add_parser("restore", help="replace both databases with a backup")
    restore.add_argument("name")
    restore.add_argument("--yes", action="store_true", help="yes, replace the databases")
    prune = sub.add_parser("prune", help="delete a schedule's backups beyond the newest --keep")
    prune.add_argument("--schedule", default=PRE_UPGRADE)
    prune.add_argument("--keep", type=int, default=1)
    return p


COMMANDS = {
    "check": cmd_check,
    "serve": cmd_serve,
    "now": cmd_now,
    "list": cmd_list,
    "restore": cmd_restore,
    "prune": cmd_prune,
}


def main(argv: Sequence[str] | None = None, env: Mapping[str, str] | None = None) -> int:
    args = parser().parse_args(argv)
    configure_logging()
    settings = Settings.from_env(os.environ if env is None else env)
    try:
        backups = build(settings, load_config(settings.config))
        return COMMANDS[args.command](backups, args)
    except EXPECTED as exc:
        print(f"hsp-backup: {exc}", file=sys.stderr)
        return 1
