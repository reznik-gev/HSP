import os
from pathlib import Path

import pytest

from hsp_backup.stores.base import StoreError
from hsp_backup.stores.folder import FolderStore
from tests.stores.conftest import NAME, OTHER


def test_a_backup_is_written_listed_fetched_and_deleted(
    tmp_folder_store: FolderStore, backup_file: Path, tmp_path: Path
) -> None:
    tmp_folder_store.put(backup_file, NAME)
    assert tmp_folder_store.names() == [NAME]
    tmp_folder_store.fetch(NAME, tmp_path / "copy.tar")
    assert (tmp_path / "copy.tar").read_bytes() == b"a backup"
    tmp_folder_store.delete(NAME)
    assert tmp_folder_store.names() == []


def test_a_write_is_renamed_into_place(tmp_folder_store: FolderStore, backup_file: Path) -> None:
    tmp_folder_store.put(backup_file, NAME)
    assert [p.name for p in tmp_folder_store.path.iterdir()] == [NAME]  # no .partial left


def test_a_write_replaces_a_backup_of_the_same_name(
    tmp_folder_store: FolderStore, backup_file: Path
) -> None:
    (tmp_folder_store.path / NAME).write_bytes(b"an older copy")
    tmp_folder_store.put(backup_file, NAME)
    assert (tmp_folder_store.path / NAME).read_bytes() == b"a backup"


def test_a_write_to_a_missing_folder_leaves_nothing(backup_file: Path, tmp_path: Path) -> None:
    missing = FolderStore("local", tmp_path / "not-mounted")
    with pytest.raises(StoreError, match=r"can't write to local \("):
        missing.put(backup_file, NAME)
    assert not (tmp_path / "not-mounted").exists()


def test_a_write_that_fails_partway_leaves_nothing(
    tmp_folder_store: FolderStore, backup_file: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def disk_full(*_: object) -> None:
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(os, "replace", disk_full)
    with pytest.raises(StoreError, match="No space left on device"):
        tmp_folder_store.put(backup_file, NAME)
    assert list(tmp_folder_store.path.iterdir()) == []


def test_names_are_the_files_in_order_without_folders(
    tmp_folder_store: FolderStore, backup_file: Path
) -> None:
    tmp_folder_store.put(backup_file, OTHER)
    tmp_folder_store.put(backup_file, NAME)
    (tmp_folder_store.path / "lost+found").mkdir()
    assert tmp_folder_store.names() == [NAME, OTHER]


def test_names_of_a_missing_folder_name_the_target(tmp_path: Path) -> None:
    with pytest.raises(StoreError, match=r"can't read local \(.*not-mounted\)"):
        FolderStore("local", tmp_path / "not-mounted").names()


def test_fetching_a_missing_backup_names_it(tmp_folder_store: FolderStore, tmp_path: Path) -> None:
    with pytest.raises(StoreError, match=f"can't read {NAME} from local"):
        tmp_folder_store.fetch(NAME, tmp_path / "copy.tar")


def test_deleting_a_missing_backup_is_fine(tmp_folder_store: FolderStore) -> None:
    tmp_folder_store.delete(NAME)
    assert tmp_folder_store.names() == []
