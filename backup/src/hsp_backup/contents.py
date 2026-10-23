"""What goes into a backup: both databases' dumps and, with include_config, the installation's
config files (docs/0106). backup/README.md lists the files."""

from pathlib import Path

from hsp_backup.archive import write_archive
from hsp_backup.names import BackupName
from hsp_backup.postgres import DATABASES, Postgres

#: The installation's files a backup holds with include_config; never secrets/ (docs/0106).
CONFIG_FILES = (".env", "backups.yml", "compose.yml")


def dump_name(database: str) -> str:
    """Where `database`'s dump is in a backup."""
    return f"{database}.dump"


def dump_databases(postgres: Postgres, into: Path) -> dict[str, Path]:
    """Dump every database into `into`; the dumps by their names in the backup."""
    dumps = {dump_name(db): into / dump_name(db) for db in DATABASES}
    for db in DATABASES:
        postgres.dump(db, dumps[dump_name(db)])
    return dumps


def config_files(install_dir: Path) -> dict[str, Path]:
    """The installation's config files that exist, by their names in the backup."""
    return {f"config/{f}": install_dir / f for f in CONFIG_FILES if (install_dir / f).is_file()}


def write_backup(
    name: BackupName,
    into: Path,
    *,
    postgres: Postgres,
    hsp_version: str,
    config_from: Path | None,
) -> Path:
    """Write backup `name` in folder `into`, with the config files from `config_from` if given."""
    members = dump_databases(postgres, into)
    if config_from is not None:
        members |= config_files(config_from)
    archive = into / str(name)
    write_archive(
        archive,
        members,
        hsp_version=hsp_version,
        schema_revision=postgres.schema_revision(),
        created=name.created,
        schedule=name.schedule,
    )
    return archive
