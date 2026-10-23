"""A folder target writes all of a backup or nothing (docs/0106)."""

from pathlib import Path

import pytest

from hsp_backup.stores.base import StoreError
from hsp_backup.stores.folder import FolderStore
from tests.stores.conftest import NAME


def test_a_failed_folder_write_leaves_nothing(backup_file: Path, tmp_path: Path) -> None:
    missing = FolderStore("local", tmp_path / "not-mounted")
    with pytest.raises(StoreError, match=r"can't write to local \("):
        missing.put(backup_file, NAME)
    assert not (tmp_path / "not-mounted").exists()


def test_a_folder_write_is_renamed_into_place(folder: FolderStore, backup_file: Path) -> None:
    folder.put(backup_file, NAME)
    assert [p.name for p in folder.path.iterdir()] == [NAME]  # no .partial left
