"""An S3 target keeps to its prefix and names its bucket when it fails (docs/0106). S3 is moto's
fake, so the boto3 calls are real."""

from pathlib import Path

import pytest
from moto import mock_aws

from hsp_backup.stores import open_store
from hsp_backup.stores.base import StoreError
from hsp_backup.stores.s3 import S3Store
from tests.stores.conftest import NAME, OFFSITE


def test_s3_lists_only_its_prefix(s3: S3Store, backup_file: Path) -> None:
    s3.client.put_object(Bucket="hsp-backups", Key="other/x.tar", Body=b"x")
    s3.client.put_object(Bucket="hsp-backups", Key="prod/old/y.tar", Body=b"y")
    s3.put(backup_file, NAME)
    assert s3.names() == [NAME]
    assert s3.client.head_object(Bucket="hsp-backups", Key=f"prod/{NAME}")["ContentLength"] == 8


def test_a_missing_bucket_is_named(secrets: Path, backup_file: Path) -> None:
    with mock_aws():
        store = open_store("offsite", OFFSITE, secrets)
        with pytest.raises(StoreError, match=r"can't write to offsite \(s3://hsp-backups/prod/\)"):
            store.put(backup_file, NAME)
