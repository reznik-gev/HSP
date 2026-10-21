"""The PostgreSQL commands hsp-backup runs, and how their failures read (docs/0106). The weekly
restore test runs them against a real database."""

from pathlib import Path

import pytest

from hsp_backup.postgres import PgTools, PostgresError, run


class SpyRunner:
    """Records each command and its password; answers `stdout`, or fails `failing` commands."""

    def __init__(self) -> None:
        self.calls: list[list[str]] = []
        self.passwords: list[str] = []
        self.stdout = ""
        self.failing: set[str] = set()

    def __call__(self, args: list[str], env: dict[str, str]) -> str:
        self.calls.append(args)
        self.passwords.append(env["PGPASSWORD"])
        if args[0] in self.failing:
            raise PostgresError(f"{args[0]} failed: boom")
        return self.stdout


@pytest.fixture
def runner() -> SpyRunner:
    return SpyRunner()


@pytest.fixture
def tools(tmp_path: Path, runner: SpyRunner) -> PgTools:
    (tmp_path / "pw").write_text("s3cret\n")
    return PgTools("postgres", "postgres", tmp_path / "pw", runner)


def test_a_dump_is_custom_format_and_compressed(tools: PgTools, runner: SpyRunner) -> None:
    tools.dump("hsp", Path("/tmp/hsp.dump"))
    [args] = runner.calls
    assert args[:3] == ["pg_dump", "--format=custom", "--compress=6"]
    assert args[-1] == "hsp"
    assert runner.passwords == ["s3cret"]


def test_a_restore_drops_then_recreates_the_database(tools: PgTools, runner: SpyRunner) -> None:
    tools.restore("keycloak", Path("/tmp/keycloak.dump"))
    assert [a[0] for a in runner.calls] == ["dropdb", "pg_restore"]
    assert runner.calls[0] == ["dropdb", "--force", "--if-exists", "keycloak"]
    assert "--create" in runner.calls[1]
    assert "--exit-on-error" in runner.calls[1]


def test_the_schema_revision_is_read_or_none(tools: PgTools, runner: SpyRunner) -> None:
    runner.stdout = "c9b2fc969b7d\n"
    assert tools.schema_revision() == "c9b2fc969b7d"
    runner.failing = {"psql"}
    assert tools.schema_revision() is None


def test_a_failing_tool_says_what_it_said() -> None:
    with pytest.raises(PostgresError, match="failed"):
        run(["python", "-c", "import sys; sys.stderr.write('no such database'); sys.exit(1)"], {})
