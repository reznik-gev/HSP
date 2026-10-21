"""Folder and S3 targets: writes are all or nothing, listing and deleting (docs/0106). S3 is
moto's fake, so the boto3 calls are real."""

from collections.abc import Iterator
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

from hsp_backup.config import FolderTarget, S3Target
from hsp_backup.stores import (
    S3_ACCESS_KEY,
    S3_SECRET_KEY,
    FolderStore,
    S3Store,
    Store,
    StoreError,
    open_store,
)

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


def test_a_failed_folder_write_leaves_nothing(backup_file: Path, tmp_path: Path) -> None:
    missing = FolderStore("local", tmp_path / "not-mounted")
    with pytest.raises(StoreError, match=r"can't write to local \("):
        missing.put(backup_file, NAME)
    assert not (tmp_path / "not-mounted").exists()


def test_a_folder_write_is_renamed_into_place(folder: FolderStore, backup_file: Path) -> None:
    folder.put(backup_file, NAME)
    assert [p.name for p in folder.path.iterdir()] == [NAME]  # no .partial left


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


def test_s3_needs_its_keys(tmp_path: Path) -> None:
    with pytest.raises(StoreError, match="needs the secret files backup_s3_access_key"):
        open_store("offsite", OFFSITE, tmp_path)


def test_a_folder_target_needs_no_keys(tmp_path: Path) -> None:
    store = open_store("local", FolderTarget(type="folder", path=tmp_path), tmp_path / "none")
    assert isinstance(store, FolderStore)
