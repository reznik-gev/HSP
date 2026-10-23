"""`hsp-backup`: the backup service's commands (docs/0106), built with typer (docs/0113).
`bin/hsp` runs them inside the backup container (docs/0107)."""

import json
from collections.abc import Callable
from functools import cache, wraps
from typing import Annotated

import structlog
import typer
from prometheus_client import REGISTRY, start_http_server

from hsp_backup.archive import ArchiveError
from hsp_backup.backups import Backups, RestoreRefused
from hsp_backup.config import MANUAL, PRE_UPGRADE, ConfigError, load_config
from hsp_backup.logs import configure_logging
from hsp_backup.metrics import PORT, BackupMetrics
from hsp_backup.postgres import PgTools, PostgresError
from hsp_backup.scheduler import BackupScheduler
from hsp_backup.settings import BackupSettings
from hsp_backup.stores.base import Store, StoreError
from hsp_backup.stores.factory import open_store

log = structlog.get_logger()

#: Failures an operator can act on: said in one line, without a traceback.
EXPECTED_ERRORS_TO_OMIT_TRACEBACK = (
    ConfigError,
    StoreError,
    RestoreRefused,
    ArchiveError,
    PostgresError,
)


def one_line_errors[**P](command: Callable[P, None]) -> Callable[P, None]:
    """The command says an expected failure in one line, without a traceback, and exits 1."""

    @wraps(command)
    def run(*args: P.args, **kwargs: P.kwargs) -> None:
        try:
            command(*args, **kwargs)
        except EXPECTED_ERRORS_TO_OMIT_TRACEBACK as exc:
            typer.echo(f"hsp-backup: {exc}", err=True)
            raise typer.Exit(1) from None

    return run


app = typer.Typer(
    help="HSP's backups (docs/0106).",
    no_args_is_help=True,
    add_completion=False,
    pretty_exceptions_enable=False,
)


@app.callback()
def _start() -> None:
    configure_logging()


@cache
def process_metrics() -> BackupMetrics:
    """The metrics this process serves; registered once."""
    return BackupMetrics(REGISTRY)


def open_backups() -> Backups:
    """The installation's backups, as the environment and backups.yml describe them."""
    settings = BackupSettings()
    config = load_config(settings.config)
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


@app.command()
@one_line_errors
def serve() -> None:
    """Run the schedules, and serve metrics on port 9465."""
    backups = open_backups()
    start_http_server(PORT)
    log.info(
        "backup service started",
        schedules=[s.name for s in backups.config.schedules],
        metrics_port=PORT,
    )
    BackupScheduler(backups.config, backups.take, backups.metrics, backups.clock).run_forever()


@app.command()
@one_line_errors
def check() -> None:
    """Check backups.yml, and that every target can be read."""
    backups = open_backups()
    config = backups.config
    for label in config.targets:
        backups.stores(label).names()  # can it be read?
    typer.echo(
        f"backups.yml is fine: {len(config.targets)} target(s), "
        f"{len(config.schedules)} schedule(s), and every target can be read"
    )


@app.command()
@one_line_errors
def now(
    schedule: Annotated[
        str, typer.Option(help="manual, pre-upgrade, or a schedule from backups.yml")
    ] = MANUAL,
) -> None:
    """Take a backup now, and print its name."""
    typer.echo(open_backups().take(schedule))


@app.command("list")
@one_line_errors
def list_backups(
    as_json: Annotated[bool, typer.Option("--json", help="as JSON, for bin/hsp")] = False,
) -> None:
    """List the backups on every target, newest first."""
    found = open_backups().list()
    if as_json:
        rows = [
            {
                "name": str(b),
                "target": label,
                "schedule": b.schedule,
                "created": b.created.isoformat(),
            }
            for label, b in found
        ]
        typer.echo(json.dumps(rows, indent=2))
    elif not found:
        typer.echo("No backups yet.")
    else:
        for label, b in found:
            typer.echo(f"{b}  {label}")


@app.command()
@one_line_errors
def restore(
    name: str,
    yes: Annotated[bool, typer.Option("--yes", help="yes, replace the databases")] = False,
) -> None:
    """Replace both databases with a backup. Stop the stack first, except postgres."""
    if not yes:
        typer.echo(
            "hsp-backup: restoring replaces HSP's and Keycloak's databases. "
            "Stop the stack except postgres, then add --yes.",
            err=True,
        )
        raise typer.Exit(2)
    manifest = open_backups().restore(name)
    typer.echo(f"Restored {name} (made by HSP {manifest.hsp_version}).")


@app.command()
@one_line_errors
def prune(
    schedule: Annotated[str, typer.Option()] = PRE_UPGRADE,
    keep: Annotated[int, typer.Option(min=1)] = 1,
) -> None:
    """Delete a schedule's backups beyond the newest --keep."""
    for gone in open_backups().prune(schedule, keep=keep):
        typer.echo(f"deleted {gone}")
