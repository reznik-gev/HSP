"""Backup file names, and which old backups to delete (docs/0106).

A backup is `hsp-<UTC time>-<schedule>.tar`, so its name alone says when it was taken and by
which schedule. Deleting counts per schedule, by the time in the name, never by file dates.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

_NAME = re.compile(r"^hsp-(\d{8}T\d{6}Z)-([a-z0-9][a-z0-9-]*)\.tar$")
_TIME = "%Y%m%dT%H%M%SZ"


@dataclass(frozen=True, order=True)
class BackupName:
    created: datetime
    schedule: str

    def __str__(self) -> str:
        return f"hsp-{self.created.astimezone(UTC):{_TIME}}-{self.schedule}.tar"

    @classmethod
    def at(cls, when: datetime, schedule: str) -> BackupName:
        """The name of `schedule`'s backup taken at `when`, to the second."""
        return cls(when.replace(microsecond=0), schedule)

    @classmethod
    def parse(cls, name: str) -> BackupName | None:
        """The backup a file name stands for, or None for any other file."""
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
    """`schedule`'s backups to delete: all but the newest `keep`, except that with `keep_days`
    those younger than that many days are kept too (whichever keeps more)."""
    mine = sorted((b for b in backups if b.schedule == schedule), reverse=True)
    cutoff = now - timedelta(days=keep_days) if keep_days else None
    return [b for i, b in enumerate(mine) if i >= keep and (cutoff is None or b.created < cutoff)]
