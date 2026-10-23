"""Where backups are kept: a folder, or an S3 bucket (docs/0106).

A half-written backup never counts: each store writes all of a backup or nothing.
"""

from pathlib import Path

from hsp_backup.config import FolderTarget, S3Target
from hsp_backup.stores.base import Store
from hsp_backup.stores.folder import FolderStore
from hsp_backup.stores.s3 import S3Store, s3_client


def open_store(label: str, target: FolderTarget | S3Target, secrets_dir: Path) -> Store:
    if isinstance(target, FolderTarget):
        return FolderStore(label, target.path)
    return S3Store(label, target, s3_client(target, secrets_dir))
