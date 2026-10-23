from collections.abc import Iterator
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

from hsp_backup.config import S3Target
from hsp_backup.stores.factory import open_store
from hsp_backup.stores.folder import FolderStore
from hsp_backup.stores.s3 import S3_ACCESS_KEY, S3_SECRET_KEY, S3Store

NAME = "hsp-20261021T023000Z-nightly.tar"
OTHER = "hsp-20261022T023000Z-nightly.tar"
BUCKET = "hsp-backups"
OFFSITE = S3Target(type="s3", bucket=BUCKET, prefix="prod/", path_style=True)


@pytest.fixture
def backup_file(tmp_path: Path) -> Path:
    f = tmp_path / NAME
    f.write_bytes(b"a backup")
    return f


@pytest.fixture
def secrets(tmp_path: Path) -> Path:
    d = tmp_path / "secrets"
    d.mkdir()
    (d / S3_ACCESS_KEY).write_text("AKIA-test\n")
    (d / S3_SECRET_KEY).write_text("secret-test\n")
    return d


@pytest.fixture
def tmp_folder_store(tmp_path: Path) -> FolderStore:
    path = tmp_path / "backups"
    path.mkdir()
    return FolderStore("local", path)


@pytest.fixture
def fake_s3() -> Iterator[None]:
    with mock_aws():
        yield


@pytest.fixture
def fake_s3_store(fake_s3: None, secrets: Path) -> S3Store:
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket=BUCKET)
    store = open_store("offsite", OFFSITE, secrets)
    assert isinstance(store, S3Store)
    return store
