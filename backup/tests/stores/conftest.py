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
OFFSITE = S3Target(type="s3", bucket="hsp-backups", prefix="prod/", path_style=True)


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
def folder(tmp_path: Path) -> FolderStore:
    path = tmp_path / "backups"
    path.mkdir()
    return FolderStore("local", path)


@pytest.fixture
def s3(secrets: Path) -> Iterator[S3Store]:
    with mock_aws():
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="hsp-backups")
        store = open_store("offsite", OFFSITE, secrets)
        assert isinstance(store, S3Store)
        yield store
