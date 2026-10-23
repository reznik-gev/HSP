"""The hsp-backup commands, as bin/hsp runs them (docs/0106, docs/0107). PostgreSQL is the spy
from conftest; targets are real folders."""

import json
from pathlib import Path

import pytest

from hsp_backup import cli
from tests.conftest import SpyPostgres

#: A backups.yml that names no target.
NO_TARGETS = "targets: {}"


@pytest.fixture
def one_folder_installation_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    """An installation whose backups.yml names one folder target, with PostgreSQL faked."""
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


def test_check_says_the_file_is_fine(
    one_folder_installation_env: dict[str, str], capsys: pytest.CaptureFixture[str]
) -> None:
    assert cli.main(["check"], one_folder_installation_env) == 0
    assert "backups.yml is fine: 1 target(s), 1 schedule(s)" in capsys.readouterr().out


@pytest.fixture
def target_folder_gone(
    one_folder_installation_env: dict[str, str], tmp_path: Path
) -> dict[str, str]:
    """The installation, with its one target's folder missing (e.g. a share not mounted)."""
    (tmp_path / "backups").rmdir()
    return one_folder_installation_env


@pytest.fixture
def no_targets(one_folder_installation_env: dict[str, str], tmp_path: Path) -> dict[str, str]:
    """The installation, with a backups.yml that names no target."""
    (tmp_path / "backups.yml").write_text(NO_TARGETS)
    return one_folder_installation_env


def test_check_names_a_target_it_cant_read(
    target_folder_gone: dict[str, str], capsys: pytest.CaptureFixture[str]
) -> None:
    assert cli.main(["check"], target_folder_gone) == 1
    assert "hsp-backup: can't read local" in capsys.readouterr().err


def test_a_bad_config_is_one_line_not_a_traceback(
    no_targets: dict[str, str], capsys: pytest.CaptureFixture[str]
) -> None:
    assert cli.main(["list"], no_targets) == 1
    assert capsys.readouterr().err.startswith("hsp-backup: backups.yml has problems")


def test_now_list_and_list_json(
    one_folder_installation_env: dict[str, str], capsys: pytest.CaptureFixture[str]
) -> None:
    assert cli.main(["now"], one_folder_installation_env) == 0
    name = capsys.readouterr().out.strip()
    assert name.endswith("-manual.tar")
    assert cli.main(["list"], one_folder_installation_env) == 0
    assert capsys.readouterr().out == f"{name}  local\n"
    assert cli.main(["list", "--json"], one_folder_installation_env) == 0
    [row] = json.loads(capsys.readouterr().out)
    assert (row["name"], row["target"], row["schedule"]) == (name, "local", "manual")


def test_restore_asks_for_yes(
    one_folder_installation_env: dict[str, str], capsys: pytest.CaptureFixture[str]
) -> None:
    assert (
        cli.main(["restore", "hsp-20261021T023000Z-nightly.tar"], one_folder_installation_env) == 2
    )
    assert "add --yes" in capsys.readouterr().err


def test_a_restore_says_what_it_restored(
    one_folder_installation_env: dict[str, str], capsys: pytest.CaptureFixture[str]
) -> None:
    cli.main(["now"], one_folder_installation_env)
    name = capsys.readouterr().out.strip()
    assert cli.main(["restore", name, "--yes"], one_folder_installation_env) == 0
    assert capsys.readouterr().out == f"Restored {name} (made by HSP 1.0.0).\n"
