"""What every store does, and the error it raises."""

from pathlib import Path
from typing import Protocol


class StoreError(Exception):
    """A target can't be read or written; the message names it."""


class Store(Protocol):
    def put(self, local: Path, name: str) -> None: ...
    def names(self) -> list[str]: ...
    def fetch(self, name: str, dest: Path) -> None: ...
    def delete(self, name: str) -> None: ...
