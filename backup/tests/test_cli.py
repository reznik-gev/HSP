import json
import re
from collections.abc import Callable
from pathlib import Path

import pytest
from typer.testing import CliRunner, Result

from hsp_backup import cli
from hsp_backup.backups import BackupPlan
from tests.conftest import SpyPostgres

#: Runs one hsp-backup command, with the given environment.
HspBackup = Callable[..., Result]

#: Colours typer adds to its own messages on a terminal, and in GitHub Actions.
COLOURS = re.compile(r"\x1b\[[0-9;]*m")

#: A backups.yml that names no target.
NO_TARGETS = "targets: {}"


@pytest.fixture
def one_folder_installation_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    (tmp_path / "backups").mkdir()
    (tmp_path / "backups.yml").write_text(
        f"targets:\n  local: {{ type: folder, path: '{(tmp_path / 'backups').as_posix()}' }}\n"
        'schedules:\n  - { name: nightly, cron: "30 2 * * *", target: local, keep: 7 }\n'
    )
    (tmp_path / "pg_password").write_text("pw")
    spy = SpyPostgres()
    monkeypatch.setattr(cli, "PgTools", lambda *_: spy)
    return {
        "HSP_BACKUP_CONFIG": str(tmp_path / "backups.yml"),
        "HSP_BACKUP_INSTALL_DIR": str(tmp_path),
        "HSP_VERSION": "1.0.0",
        "PGPASSWORD_FILE": str(tmp_path / "pg_password"),
    }


@pytest.fixture
def target_folder_gone(
    one_folder_installation_env: dict[str, str], tmp_path: Path
) -> dict[str, str]:
    (tmp_path / "backups").rmdir()
    return one_folder_installation_env


@pytest.fixture
def no_targets(one_folder_installation_env: dict[str, str], tmp_path: Path) -> dict[str, str]:
    (tmp_path / "backups.yml").write_text(NO_TARGETS)
    return one_folder_installation_env


@pytest.fixture
def hsp_backup() -> HspBackup:
    runner = CliRunner()

    def run(env: dict[str, str], *args: str) -> Result:
        return runner.invoke(cli.app, list(args), env=env)

    return run


def test_check_says_the_file_is_fine(
    hsp_backup: HspBackup, one_folder_installation_env: dict[str, str]
) -> None:
    done = hsp_backup(one_folder_installation_env, "check")
    assert done.exit_code == 0
    assert "backups.yml is fine: 1 target(s), 1 schedule(s)" in done.stdout


def test_check_says_what_each_schedule_keeps(
    hsp_backup: HspBackup, one_folder_installation_env: dict[str, str]
) -> None:
    done = hsp_backup(one_folder_installation_env, "check")
    assert done.stdout.splitlines()[1:] == [
        "  nightly: the newest 7, on local",
        "  manual: the newest 5, on local",
        "  pre-upgrade: every backup until `hsp upgrade` succeeds, on local",
    ]


def test_a_schedule_with_keep_days_keeps_those_days_too() -> None:
    plan = BackupPlan("offsite", True, keep=8, keep_days=90)
    assert cli.what_is_kept(plan) == "the newest 8, and every one from the last 90 days, on offsite"


def test_check_names_a_target_it_cant_read(
    hsp_backup: HspBackup, target_folder_gone: dict[str, str]
) -> None:
    done = hsp_backup(target_folder_gone, "check")
    assert done.exit_code == 1
    assert "hsp-backup: can't read local" in done.stderr


def test_a_bad_config_is_one_line_not_a_traceback(
    hsp_backup: HspBackup, no_targets: dict[str, str]
) -> None:
    done = hsp_backup(no_targets, "list")
    assert done.exit_code == 1
    assert done.stderr.startswith("hsp-backup: backups.yml has problems")
    assert "Traceback" not in done.stderr


def test_now_list_and_list_json(
    hsp_backup: HspBackup, one_folder_installation_env: dict[str, str]
) -> None:
    name = hsp_backup(one_folder_installation_env, "now").stdout.strip()
    assert name.endswith("-manual.tar")
    assert hsp_backup(one_folder_installation_env, "list").stdout == f"{name}  local\n"
    [row] = json.loads(hsp_backup(one_folder_installation_env, "list", "--json").stdout)
    assert (row["name"], row["target"], row["schedule"]) == (name, "local", "manual")


def test_restore_asks_for_yes(
    hsp_backup: HspBackup, one_folder_installation_env: dict[str, str]
) -> None:
    done = hsp_backup(one_folder_installation_env, "restore", "hsp-20261021T023000Z-nightly.tar")
    assert done.exit_code == 2
    assert "add --yes" in done.stderr


def test_a_restore_says_what_it_restored(
    hsp_backup: HspBackup, one_folder_installation_env: dict[str, str]
) -> None:
    name = hsp_backup(one_folder_installation_env, "now").stdout.strip()
    done = hsp_backup(one_folder_installation_env, "restore", name, "--yes")
    assert done.exit_code == 0
    assert done.stdout == f"Restored {name} (made by HSP 1.0.0).\n"


def test_prune_keeps_at_least_one(
    hsp_backup: HspBackup, one_folder_installation_env: dict[str, str]
) -> None:
    done = hsp_backup(one_folder_installation_env, "prune", "--keep", "0")
    assert done.exit_code == 2
    assert "--keep" in COLOURS.sub("", done.stderr)
