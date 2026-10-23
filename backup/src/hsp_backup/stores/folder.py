"""A folder target: a local disk or a mounted share. A backup is written under a temporary name
and renamed, so a half-written one never shows."""

import os
import shutil
from pathlib import Path

from hsp_backup.stores.base import StoreError


class FolderStore:
    def __init__(self, label: str, path: Path) -> None:
        self.label = label
        self.path = path

    def put(self, local: Path, name: str) -> None:
        partial = self.path / f".{name}.partial"
        try:
            shutil.copyfile(local, partial)
            os.replace(partial, self.path / name)
        except OSError as exc:
            partial.unlink(missing_ok=True)
            raise StoreError(f"can't write to {self.label} ({self.path}): {exc.strerror}") from None

    def names(self) -> list[str]:
        try:
            return sorted(p.name for p in self.path.iterdir() if p.is_file())
        except OSError as exc:
            raise StoreError(f"can't read {self.label} ({self.path}): {exc.strerror}") from None

    def fetch(self, name: str, dest: Path) -> None:
        try:
            shutil.copyfile(self.path / name, dest)
        except OSError as exc:
            raise StoreError(f"can't read {name} from {self.label}: {exc.strerror}") from None

    def delete(self, name: str) -> None:
        (self.path / name).unlink(missing_ok=True)
