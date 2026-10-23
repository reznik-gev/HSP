"""An S3 target: AWS, MinIO or another S3-compatible store. A backup is uploaded and its size
checked, and a failed upload is deleted, so a half-written one never shows."""

from contextlib import suppress
from pathlib import Path
from typing import TYPE_CHECKING

import boto3
from boto3.exceptions import Boto3Error
from botocore.client import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

from hsp_backup.config import S3Target
from hsp_backup.stores.base import StoreError

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

#: What boto3 raises when S3 can't be reached or refuses.
S3_ERRORS = (BotoCoreError, ClientError, Boto3Error)

#: The secret files an S3 target signs in with (docs/0106).
S3_ACCESS_KEY = "backup_s3_access_key"
S3_SECRET_KEY = "backup_s3_secret_key"


class S3Store:
    def __init__(self, label: str, target: S3Target, client: S3Client) -> None:
        self.label = label
        self.bucket = target.bucket
        self.prefix = target.prefix
        self.client = client

    def _fail(self, doing: str, exc: Exception) -> StoreError:
        return StoreError(f"can't {doing} {self.label} (s3://{self.bucket}/{self.prefix}): {exc}")

    def put(self, local: Path, name: str) -> None:
        key = self.prefix + name
        try:
            self.client.upload_file(str(local), self.bucket, key)
            size = self.client.head_object(Bucket=self.bucket, Key=key)["ContentLength"]
        except S3_ERRORS as exc:
            self._delete_quietly(key)
            raise self._fail("write to", exc) from None
        if size != local.stat().st_size:
            self._delete_quietly(key)
            raise StoreError(f"{name} arrived incomplete in {self.label}; it was removed")

    def names(self) -> list[str]:
        found: list[str] = []
        try:
            pages = self.client.get_paginator("list_objects_v2").paginate(
                Bucket=self.bucket, Prefix=self.prefix
            )
            for page in pages:
                for obj in page.get("Contents", []):
                    rest = obj["Key"].removeprefix(self.prefix)
                    if "/" not in rest:
                        found.append(rest)
        except S3_ERRORS as exc:
            raise self._fail("read", exc) from None
        return sorted(found)

    def fetch(self, name: str, dest: Path) -> None:
        try:
            self.client.download_file(self.bucket, self.prefix + name, str(dest))
        except S3_ERRORS as exc:
            raise self._fail(f"read {name} from", exc) from None

    def delete(self, name: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=self.prefix + name)
        except S3_ERRORS as exc:
            raise self._fail(f"delete {name} from", exc) from None

    def _delete_quietly(self, key: str) -> None:
        with suppress(*S3_ERRORS):
            self.client.delete_object(Bucket=self.bucket, Key=key)


def _secret(secrets_dir: Path, name: str) -> str:
    try:
        return (secrets_dir / name).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def s3_client(target: S3Target, secrets_dir: Path) -> S3Client:
    access, secret = _secret(secrets_dir, S3_ACCESS_KEY), _secret(secrets_dir, S3_SECRET_KEY)
    if not (access and secret):
        raise StoreError(f"an S3 target needs the secret files {S3_ACCESS_KEY} and {S3_SECRET_KEY}")
    client: S3Client = boto3.client(
        "s3",
        endpoint_url=target.endpoint,
        region_name=target.region,
        aws_access_key_id=access,
        aws_secret_access_key=secret,
        verify=str(target.ca_file) if target.ca_file else True,
        config=BotoConfig(s3={"addressing_style": "path" if target.path_style else "auto"}),
    )
    return client
