from pathlib import Path
from typing import Any

import boto3
import pytest
from botocore.exceptions import ClientError

from hsp_backup.config import S3Target
from hsp_backup.stores.base import StoreError
from hsp_backup.stores.s3 import S3_ACCESS_KEY, S3Store, s3_client
from tests.stores.conftest import BUCKET, NAME, OFFSITE, OTHER


def keys(store: S3Store) -> list[str]:
    listed = store.client.list_objects_v2(Bucket=BUCKET)
    return sorted(obj["Key"] for obj in listed.get("Contents", []))


def test_a_backup_is_written_listed_fetched_and_deleted(
    fake_s3_store: S3Store, backup_file: Path, tmp_path: Path
) -> None:
    fake_s3_store.put(backup_file, NAME)
    assert fake_s3_store.names() == [NAME]
    fake_s3_store.fetch(NAME, tmp_path / "copy.tar")
    assert (tmp_path / "copy.tar").read_bytes() == b"a backup"
    fake_s3_store.delete(NAME)
    assert fake_s3_store.names() == []


def test_a_backup_is_written_under_the_prefix(fake_s3_store: S3Store, backup_file: Path) -> None:
    fake_s3_store.put(backup_file, NAME)
    assert keys(fake_s3_store) == [f"prod/{NAME}"]


def test_names_are_only_those_directly_under_the_prefix(
    fake_s3_store: S3Store, backup_file: Path
) -> None:
    fake_s3_store.client.put_object(Bucket=BUCKET, Key="other/x.tar", Body=b"x")
    fake_s3_store.client.put_object(Bucket=BUCKET, Key="prod/old/y.tar", Body=b"y")
    fake_s3_store.put(backup_file, OTHER)
    fake_s3_store.put(backup_file, NAME)
    assert fake_s3_store.names() == [NAME, OTHER]


def test_without_a_prefix_names_are_the_top_of_the_bucket(
    fake_s3_store: S3Store, backup_file: Path
) -> None:
    whole_bucket = S3Store(
        "offsite", OFFSITE.model_copy(update={"prefix": ""}), fake_s3_store.client
    )
    fake_s3_store.put(backup_file, NAME)
    whole_bucket.put(backup_file, OTHER)
    assert whole_bucket.names() == [OTHER]


def test_names_go_past_the_first_page_of_a_listing(
    fake_s3_store: S3Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    many = [f"hsp-20261021T0{i}0000Z-nightly.tar" for i in range(5)]
    for name in many:
        fake_s3_store.client.put_object(Bucket=BUCKET, Key=f"prod/{name}", Body=b"")
    paginator = fake_s3_store.client.get_paginator("list_objects_v2")
    paginate = paginator.paginate
    monkeypatch.setattr(
        paginator, "paginate", lambda **kw: paginate(**kw, PaginationConfig={"PageSize": 2})
    )
    monkeypatch.setattr(fake_s3_store.client, "get_paginator", lambda _: paginator)
    assert fake_s3_store.names() == many


def test_an_upload_that_arrives_short_is_removed(
    fake_s3_store: S3Store, backup_file: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def short_upload(local: str, bucket: str, key: str) -> None:
        fake_s3_store.client.put_object(Bucket=bucket, Key=key, Body=b"a back")

    monkeypatch.setattr(fake_s3_store.client, "upload_file", short_upload)
    with pytest.raises(StoreError, match=f"{NAME} arrived incomplete in offsite"):
        fake_s3_store.put(backup_file, NAME)
    assert keys(fake_s3_store) == []


def test_an_upload_that_fails_partway_is_removed(
    fake_s3_store: S3Store, backup_file: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken_upload(local: str, bucket: str, key: str) -> None:
        fake_s3_store.client.put_object(Bucket=bucket, Key=key, Body=b"a b")
        raise ClientError({"Error": {"Code": "RequestTimeout"}}, "UploadPart")

    monkeypatch.setattr(fake_s3_store.client, "upload_file", broken_upload)
    with pytest.raises(StoreError, match=r"can't write to offsite \(s3://hsp-backups/prod/\)"):
        fake_s3_store.put(backup_file, NAME)
    assert keys(fake_s3_store) == []


def test_a_missing_bucket_is_named(fake_s3: None, secrets: Path, backup_file: Path) -> None:
    store = S3Store("offsite", OFFSITE, s3_client(OFFSITE, secrets))
    with pytest.raises(StoreError, match=r"can't write to offsite \(s3://hsp-backups/prod/\)"):
        store.put(backup_file, NAME)
    with pytest.raises(StoreError, match=r"can't read offsite \(s3://hsp-backups/prod/\)"):
        store.names()


def test_fetching_a_missing_backup_names_it(fake_s3_store: S3Store, tmp_path: Path) -> None:
    with pytest.raises(StoreError, match=f"can't read {NAME} from offsite"):
        fake_s3_store.fetch(NAME, tmp_path / "copy.tar")


def test_deleting_a_missing_backup_is_fine(fake_s3_store: S3Store) -> None:
    fake_s3_store.delete(NAME)
    assert fake_s3_store.names() == []


def test_one_key_alone_is_refused(tmp_path: Path) -> None:
    (tmp_path / S3_ACCESS_KEY).write_text("AKIA-test")
    with pytest.raises(StoreError, match="needs the secret files"):
        s3_client(OFFSITE, tmp_path)


def test_the_client_signs_in_and_connects_as_the_target_says(
    secrets: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    made: dict[str, Any] = {}
    monkeypatch.setattr(boto3, "client", lambda _, **kw: made.update(kw))
    minio = S3Target(
        type="s3",
        bucket=BUCKET,
        endpoint="https://minio.corp:9000",
        region="il-central-1",
        path_style=True,
        ca_file=tmp_path / "corp-ca.pem",
    )
    s3_client(minio, secrets)
    assert made["aws_access_key_id"] == "AKIA-test"  # without the key file's newline
    assert made["aws_secret_access_key"] == "secret-test"
    assert made["endpoint_url"] == "https://minio.corp:9000"
    assert made["region_name"] == "il-central-1"
    assert made["verify"] == str(tmp_path / "corp-ca.pem")
    assert made["config"].s3 == {"addressing_style": "path"}


def test_the_client_checks_certificates_the_usual_way_without_a_ca_file(
    secrets: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    made: dict[str, Any] = {}
    monkeypatch.setattr(boto3, "client", lambda _, **kw: made.update(kw))
    s3_client(S3Target(type="s3", bucket=BUCKET), secrets)
    assert made["verify"] is True
    assert made["config"].s3 == {"addressing_style": "auto"}
