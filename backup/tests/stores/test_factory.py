from pathlib import Path

import pytest

from hsp_backup.config import FolderTarget
from hsp_backup.stores.base import StoreError
from hsp_backup.stores.factory import open_store
from hsp_backup.stores.folder import FolderStore
from hsp_backup.stores.s3 import S3Store
from tests.stores.conftest import OFFSITE


def test_a_folder_target_opens_a_folder_store_without_keys(tmp_path: Path) -> None:
    store = open_store("local", FolderTarget(type="folder", path=tmp_path), tmp_path / "none")
    assert isinstance(store, FolderStore)
    assert (store.label, store.path) == ("local", tmp_path)


def test_an_s3_target_opens_an_s3_store(fake_s3: None, secrets: Path) -> None:
    store = open_store("offsite", OFFSITE, secrets)
    assert isinstance(store, S3Store)
    assert (store.label, store.bucket, store.prefix) == ("offsite", "hsp-backups", "prod/")


def test_an_s3_target_without_its_keys_is_refused(tmp_path: Path) -> None:
    with pytest.raises(StoreError, match="needs the secret files backup_s3_access_key"):
        open_store("offsite", OFFSITE, tmp_path)
