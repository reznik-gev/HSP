from pathlib import Path

from musical_chairs_backup.config import FolderTarget, S3Target
from musical_chairs_backup.stores.base import Store
from musical_chairs_backup.stores.folder import FolderStore
from musical_chairs_backup.stores.s3 import S3Store, s3_client


def open_store(label: str, target: FolderTarget | S3Target, secrets_dir: Path) -> Store:
    if isinstance(target, FolderTarget):
        return FolderStore(label, target.path)
    return S3Store(label, target, s3_client(target, secrets_dir))
