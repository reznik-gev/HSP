import tarfile
from pathlib import Path

import pytest
from prometheus_client import CollectorRegistry

from hsp_backup.archive import read_manifest
from hsp_backup.backups import Backups, RestoreRefused, refuse_newer
from hsp_backup.stores.folder import FolderStore
from tests.conftest import FakeClock, SpyPostgres


@pytest.fixture
def never_taken_backup_name() -> str:
    return "hsp-20200101T000000Z-nightly.tar"


def files_in(store: FolderStore) -> list[str]:
    return sorted(p.name for p in store.path.iterdir())


def members_of(archive: Path) -> list[str]:
    with tarfile.open(archive) as tar:
        return sorted(tar.getnames())


def metric(registry: CollectorRegistry, name: str, schedule: str) -> float | None:
    return registry.get_sample_value(f"hsp_backup_{name}", {"schedule": schedule})


def test_a_backup_holds_both_databases_and_a_manifest(
    backups: Backups, folder_stores_by_targets: dict[str, FolderStore]
) -> None:
    name = backups.take("nightly")
    assert str(name) == "hsp-20261021T023000Z-nightly.tar"
    archive = folder_stores_by_targets["local"].path / str(name)
    assert members_of(archive) == ["hsp.dump", "keycloak.dump", "manifest.json"]
    manifest = read_manifest(archive)
    assert (manifest.hsp_version, manifest.schema_revision) == ("1.0.0", "c9b2fc969b7d")
    assert manifest.schedule == "nightly"


def test_include_config_adds_the_files_but_never_secrets(
    backups: Backups, folder_stores_by_targets: dict[str, FolderStore]
) -> None:
    name = backups.take("weekly")
    members = members_of(folder_stores_by_targets["nas"].path / str(name))
    assert members == [
        "config/.env",
        "config/backups.yml",
        "config/compose.yml",
        "hsp.dump",
        "keycloak.dump",
        "manifest.json",
    ]


def test_each_schedule_keeps_its_newest(
    backups: Backups, folder_stores_by_targets: dict[str, FolderStore], fake_clock: FakeClock
) -> None:
    for _ in range(5):
        backups.take("nightly")
        fake_clock.advance(days=1)
    backups.take("manual")
    assert files_in(folder_stores_by_targets["local"]) == [
        "hsp-20261023T023000Z-nightly.tar",
        "hsp-20261024T023000Z-nightly.tar",
        "hsp-20261025T023000Z-nightly.tar",
        "hsp-20261026T023000Z-manual.tar",
    ]


def test_manual_backups_keep_their_own_count(
    backups: Backups, folder_stores_by_targets: dict[str, FolderStore], fake_clock: FakeClock
) -> None:
    backups.take("nightly")
    for _ in range(3):
        fake_clock.advance(hours=1)
        backups.take("manual")
    assert [n.split("-")[-1] for n in files_in(folder_stores_by_targets["local"])] == [
        "nightly.tar",
        "manual.tar",
        "manual.tar",
    ]


def test_pre_upgrade_backups_are_never_deleted_automatically(
    backups: Backups, folder_stores_by_targets: dict[str, FolderStore], fake_clock: FakeClock
) -> None:
    for _ in range(4):
        backups.take("pre-upgrade")
        fake_clock.advance(days=1)
    assert len(files_in(folder_stores_by_targets["local"])) == 4
    assert backups.prune("pre-upgrade", keep=1) == [
        "hsp-20261023T023000Z-pre-upgrade.tar",
        "hsp-20261022T023000Z-pre-upgrade.tar",
        "hsp-20261021T023000Z-pre-upgrade.tar",
    ]


def test_a_failed_backup_leaves_nothing_and_keeps_the_old_ones(
    backups: Backups,
    spy_postgres: SpyPostgres,
    folder_stores_by_targets: dict[str, FolderStore],
    fake_clock: FakeClock,
    registry: CollectorRegistry,
) -> None:
    for _ in range(3):
        backups.take("nightly")
        fake_clock.advance(days=1)
    spy_postgres.fail_dump = True
    with pytest.raises(RuntimeError, match="connection refused"):
        backups.take("nightly")
    assert len(files_in(folder_stores_by_targets["local"])) == 3
    assert (
        metric(registry, "last_failure_timestamp_seconds", "nightly") == fake_clock.now.timestamp()
    )


def test_success_is_measured(backups: Backups, registry: CollectorRegistry) -> None:
    name = backups.take("nightly")
    assert metric(registry, "last_success_timestamp_seconds", "nightly") == (
        name.created.timestamp()
    )
    assert (metric(registry, "size_bytes", "nightly") or 0) > 0


def test_the_list_shows_every_target_newest_first(backups: Backups, fake_clock: FakeClock) -> None:
    backups.take("weekly")
    fake_clock.advance(hours=1)
    backups.take("nightly")
    assert [(label, str(b)) for label, b in backups.list()] == [
        ("local", "hsp-20261021T033000Z-nightly.tar"),
        ("nas", "hsp-20261021T023000Z-weekly.tar"),
    ]


def test_a_restore_replaces_both_databases(backups: Backups, spy_postgres: SpyPostgres) -> None:
    name = backups.take("weekly")
    spy_postgres.content = {"hsp": b"later", "keycloak": b"later"}
    manifest = backups.restore(str(name))
    assert manifest.schedule == "weekly"
    assert spy_postgres.restored == {"hsp": b"hsp rows v1", "keycloak": b"keycloak rows v1"}


@pytest.fixture
def nas_unreadable(folder_stores_by_targets: dict[str, FolderStore]) -> None:
    folder_stores_by_targets["nas"].path.rmdir()


def test_a_restore_skips_a_target_it_cant_read(
    backups: Backups, spy_postgres: SpyPostgres, nas_unreadable: None
) -> None:
    name = backups.take("nightly")  # on local, which still works
    backups.restore(str(name))
    assert spy_postgres.restored["hsp"] == b"hsp rows v1"


@pytest.mark.usefixtures("nas_unreadable")
def test_a_missing_backup_names_the_targets_it_couldnt_read(
    backups: Backups, never_taken_backup_name: str
) -> None:
    with pytest.raises(RestoreRefused, match=r"no target holds .* \(couldn't read nas\)"):
        backups.restore(never_taken_backup_name)


def test_a_restore_needs_a_backup_that_exists(
    backups: Backups, never_taken_backup_name: str
) -> None:
    with pytest.raises(RestoreRefused, match="no target holds"):
        backups.restore(never_taken_backup_name)
    with pytest.raises(RestoreRefused, match="isn't a backup name"):
        backups.restore("latest")


def test_a_backup_from_a_newer_hsp_is_refused(backups: Backups, spy_postgres: SpyPostgres) -> None:
    name = backups.take("nightly")
    backups.hsp_version = "0.9.0"
    with pytest.raises(
        RestoreRefused, match=r"made by HSP 1\.0\.0, newer than the installed 0\.9\.0"
    ):
        backups.restore(str(name))
    assert spy_postgres.restored == {}


@pytest.mark.parametrize(
    ("made_by", "installed"),
    [("1.0.0", "1.0.0"), ("1.0.0", "1.1.0"), ("1.1.0-rc.1", "1.1.0"), ("0.0.0-dev", "0.0.0-dev")],
)
def test_the_same_or_an_older_version_is_restorable(made_by: str, installed: str) -> None:
    refuse_newer("b", made_by, installed)


@pytest.mark.parametrize(
    ("made_by", "installed"), [("1.1.0", "1.0.0"), ("1.1.0", "1.1.0-rc.2"), ("custom", "1.0.0")]
)
def test_a_newer_or_unknown_version_is_refused(made_by: str, installed: str) -> None:
    with pytest.raises(RestoreRefused):
        refuse_newer("b", made_by, installed)
