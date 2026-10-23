from pathlib import Path

from hsp_backup.archive import write_archive
from hsp_backup.names import BackupName
from hsp_backup.postgres import DATABASES, Postgres

#: The installation's files a backup holds with include_config; never secrets/ (docs/0106).
CONFIG_FILES = (".env", "backups.yml", "compose.yml")


def dump_name(database: str) -> str:
    return f"{database}.dump"


def dump_databases(postgres: Postgres, into: Path) -> dict[str, Path]:
    dumps = {dump_name(db): into / dump_name(db) for db in DATABASES}
    for db in DATABASES:
        postgres.dump(db, dumps[dump_name(db)])
    return dumps


def config_files(install_dir: Path) -> dict[str, Path]:
    return {f"config/{f}": install_dir / f for f in CONFIG_FILES if (install_dir / f).is_file()}


def write_backup(
    name: BackupName,
    into: Path,
    *,
    postgres: Postgres,
    hsp_version: str,
    config_from: Path | None,
) -> Path:
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
