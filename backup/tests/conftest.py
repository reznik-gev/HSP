from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from prometheus_client import CollectorRegistry

from hsp_backup.backups import Backups
from hsp_backup.config import BackupConfig, parse_config
from hsp_backup.metrics import BackupMetrics
from hsp_backup.stores.base import Store
from hsp_backup.stores.folder import FolderStore

START = datetime(2026, 10, 21, 2, 30, tzinfo=UTC)


class FakeClock:
    def __init__(self) -> None:
        self.now = START

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


class SpyPostgres:
    def __init__(self) -> None:
        self.content = {"hsp": b"hsp rows v1", "keycloak": b"keycloak rows v1"}
        self.revision: str | None = "c9b2fc969b7d"
        self.restored: dict[str, bytes] = {}
        self.fail_dump = False

    def dump(self, database: str, out: Path) -> None:
        if self.fail_dump:
            raise RuntimeError("pg_dump failed: connection refused")
        out.write_bytes(self.content[database])

    def schema_revision(self) -> str | None:
        return self.revision

    def restore(self, database: str, dump: Path) -> None:
        self.restored[database] = dump.read_bytes()


NIGHTLY_TO_LOCAL_WEEKLY_TO_NAS = """
targets:
  local: { type: folder, path: /backups }
  nas: { type: folder, path: /nas }
schedules:
  - { name: nightly, cron: "30 2 * * *", target: local, keep: 3 }
  - { name: weekly, cron: "0 4 * * 0", target: nas, keep: 2, include_config: true }
manual: { target: local, keep: 2 }
"""


@pytest.fixture
def nightly_and_weekly_config() -> BackupConfig:
    return parse_config(NIGHTLY_TO_LOCAL_WEEKLY_TO_NAS)


@pytest.fixture
def fake_clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def spy_postgres() -> SpyPostgres:
    return SpyPostgres()


@pytest.fixture
def folder_stores_by_targets(
    tmp_path: Path, nightly_and_weekly_config: BackupConfig
) -> dict[str, FolderStore]:
    stores = {}
    for label in nightly_and_weekly_config.targets:
        (tmp_path / label).mkdir()
        stores[label] = FolderStore(label, tmp_path / label)
    return stores


@pytest.fixture
def install_dir(tmp_path: Path) -> Path:
    d = tmp_path / "install"
    (d / "secrets").mkdir(parents=True)
    (d / ".env").write_text("HSP_VERSION=1.0.0\n")
    (d / "backups.yml").write_text(NIGHTLY_TO_LOCAL_WEEKLY_TO_NAS)
    (d / "compose.yml").write_text("name: hsp\n")
    (d / "secrets" / "db_superuser_password").write_text("never in a backup")
    return d


@pytest.fixture
def registry() -> CollectorRegistry:
    return CollectorRegistry()


@pytest.fixture
def backups(
    registry: CollectorRegistry,
    nightly_and_weekly_config: BackupConfig,
    spy_postgres: SpyPostgres,
    folder_stores_by_targets: dict[str, FolderStore],
    install_dir: Path,
    fake_clock: FakeClock,
) -> Backups:
    def store(label: str) -> Store:
        return folder_stores_by_targets[label]

    return Backups(
        config=nightly_and_weekly_config,
        postgres=spy_postgres,
        stores=store,
        hsp_version="1.0.0",
        install_dir=install_dir,
        metrics=BackupMetrics(registry),
        clock=fake_clock,
    )
