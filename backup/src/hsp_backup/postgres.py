"""PostgreSQL's own tools, run as the superuser: pg_dump, pg_restore, dropdb and psql
(docs/0106). The superuser is needed to dump and restore both databases with their owners."""

import os
import subprocess
from pathlib import Path
from typing import Protocol

#: HSP's database and Keycloak's, both in every backup.
DATABASES = ("hsp", "keycloak")


class PostgresError(Exception):
    """A PostgreSQL tool failed; the message carries the end of what it said."""


class Postgres(Protocol):
    def dump(self, database: str, out: Path) -> None: ...
    def schema_revision(self) -> str | None: ...
    def restore(self, database: str, dump: Path) -> None: ...


class Runner(Protocol):
    def __call__(self, args: list[str], env: dict[str, str]) -> str: ...


def run(args: list[str], env: dict[str, str]) -> str:
    done = subprocess.run(args, env=env, capture_output=True, text=True, check=False)
    if done.returncode != 0:
        said = " ".join(done.stderr.strip().splitlines()[-3:])
        raise PostgresError(f"{args[0]} failed: {said}")
    return done.stdout


class PgTools:
    def __init__(self, host: str, user: str, password_file: Path, runner: Runner = run) -> None:
        self._env = {
            **os.environ,
            "PGHOST": host,
            "PGUSER": user,
            "PGPASSWORD": password_file.read_text(encoding="utf-8").strip(),
        }
        self._run = runner

    def dump(self, database: str, out: Path) -> None:
        self._run(
            ["pg_dump", "--format=custom", "--compress=6", f"--file={out}", database], self._env
        )

    def schema_revision(self) -> str | None:
        """HSP's Alembic revision, recorded in the manifest; None if the table is missing."""
        try:
            out = self._run(
                ["psql", "-tA", "-d", "hsp", "-c", "SELECT version_num FROM alembic_version"],
                self._env,
            )
        except PostgresError:
            return None
        return out.strip() or None

    def restore(self, database: str, dump: Path) -> None:
        """Replace `database` with the dump: drop it, then let pg_restore create it again with
        its owner, extensions and settings."""
        self._run(["dropdb", "--force", "--if-exists", database], self._env)
        self._run(
            ["pg_restore", "--create", "--exit-on-error", "--dbname=postgres", str(dump)],
            self._env,
        )
