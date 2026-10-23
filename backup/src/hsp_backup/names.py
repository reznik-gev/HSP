import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

_NAME = re.compile(r"^hsp-(\d{8}T\d{6}Z)-([a-z0-9][a-z0-9-]*)\.tar$")
_TIME = "%Y%m%dT%H%M%SZ"

DEFAULT_KEEP = 7
DEFAULT_KEEP_DAYS = 7
KEEP_FOREVER = -1


@dataclass(frozen=True, order=True)
class BackupName:
    created: datetime
    schedule: str

    def __str__(self) -> str:
        return f"hsp-{self.created.astimezone(UTC):{_TIME}}-{self.schedule}.tar"

    @classmethod
    def at(cls, when: datetime, schedule: str) -> BackupName:
        return cls(when.replace(microsecond=0), schedule)

    @classmethod
    def parse(cls, name: str) -> BackupName | None:
        m = _NAME.match(name)
        if not m:
            return None
        created = datetime.strptime(m.group(1), _TIME).replace(tzinfo=UTC)
        return cls(created, m.group(2))


def expired(
    backups: Iterable[BackupName],
    schedule: str,
    *,
    keep: int,
    keep_days: int | None = None,
    now: datetime,
) -> list[BackupName]:
    if keep == KEEP_FOREVER:
        return []
    mine = sorted((b for b in backups if b.schedule == schedule), reverse=True)
    cutoff = now - timedelta(days=keep_days) if keep_days else None
    return [b for i, b in enumerate(mine) if i >= keep and (cutoff is None or b.created < cutoff)]
