from pathlib import Path

import pytest

from hsp_backup.config import FolderTarget
from hsp_backup.stores.base import Store, StoreError
from hsp_backup.stores.factory import open_store
from hsp_backup.stores.folder import FolderStore
from tests.stores.conftest import NAME, OFFSITE


@pytest.fixture(params=["folder", "s3"])
def store(request: pytest.FixtureRequest) -> Store:
    found: Store = request.getfixturevalue(request.param)
    return found


def test_a_backup_is_written_listed_fetched_and_deleted(
    store: Store, backup_file: Path, tmp_path: Path
) -> None:
    store.put(backup_file, NAME)
    assert store.names() == [NAME]
    store.fetch(NAME, tmp_path / "copy.tar")
    assert (tmp_path / "copy.tar").read_bytes() == b"a backup"
    store.delete(NAME)
    assert store.names() == []


def test_s3_needs_its_keys(tmp_path: Path) -> None:
    with pytest.raises(StoreError, match="needs the secret files backup_s3_access_key"):
        open_store("offsite", OFFSITE, tmp_path)


def test_a_folder_target_needs_no_keys(tmp_path: Path) -> None:
    store = open_store("local", FolderTarget(type="folder", path=tmp_path), tmp_path / "none")
    assert isinstance(store, FolderStore)
