"""Shared test doubles: a PostgreSQL that dumps and restores in memory, folder targets in a
temporary directory, and a clock tests move on (docs/0096)."""

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
    """Dumps each database as its current `content`, and records what was restored."""

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


#: Nightly to a local folder, weekly to another; manual backups keep 2.
CONFIG = """
targets:
  local: { type: folder, path: /backups }
  nas: { type: folder, path: /nas }
schedules:
  - { name: nightly, cron: "30 2 * * *", target: local, keep: 3 }
  - { name: weekly, cron: "0 4 * * 0", target: nas, keep: 2, include_config: true }
manual: { target: local, keep: 2 }
"""


@pytest.fixture
def config() -> BackupConfig:
    return parse_config(CONFIG)


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def postgres() -> SpyPostgres:
    return SpyPostgres()


@pytest.fixture
def folders(tmp_path: Path, config: BackupConfig) -> dict[str, FolderStore]:
    """One folder per target in `config`, under tmp_path."""
    stores = {}
    for label in config.targets:
        (tmp_path / label).mkdir()
        stores[label] = FolderStore(label, tmp_path / label)
    return stores


@pytest.fixture
def install_dir(tmp_path: Path) -> Path:
    """An installation folder with its config files and secrets/."""
    d = tmp_path / "install"
    (d / "secrets").mkdir(parents=True)
    (d / ".env").write_text("HSP_VERSION=1.0.0\n")
    (d / "backups.yml").write_text(CONFIG)
    (d / "compose.yml").write_text("name: hsp\n")
    (d / "secrets" / "db_superuser_password").write_text("never in a backup")
    return d


@pytest.fixture
def registry() -> CollectorRegistry:
    """Where the backup metrics of one test go."""
    return CollectorRegistry()


@pytest.fixture
def backups(
    registry: CollectorRegistry,
    config: BackupConfig,
    postgres: SpyPostgres,
    folders: dict[str, FolderStore],
    install_dir: Path,
    clock: FakeClock,
) -> Backups:
    def store(label: str) -> Store:
        return folders[label]

    return Backups(
        config=config,
        postgres=postgres,
        stores=store,
        hsp_version="1.0.0",
        install_dir=install_dir,
        metrics=BackupMetrics(registry),
        clock=clock,
    )
