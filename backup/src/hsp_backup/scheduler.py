"""Runs each schedule at its cron times, in `backups.yml`'s time zone (docs/0106).

Schedules due at the same moment run one after another. One that comes due while a backup is
still running is skipped and logged, and waits for its next time. A failed backup is logged
and measured, and the next one runs as usual: no retries.
"""

import time
from collections.abc import Callable
from datetime import datetime
from zoneinfo import ZoneInfo

import structlog
from croniter import croniter

from hsp_backup.config import BackupConfig
from hsp_backup.metrics import BackupMetrics

log = structlog.get_logger()

#: The longest sleep, so a changed system clock is noticed within a minute.
MAX_SLEEP_S = 60.0


class Scheduler:
    def __init__(
        self,
        config: BackupConfig,
        take: Callable[[str], object],
        metrics: BackupMetrics,
        clock: Callable[[], datetime],
    ) -> None:
        self._crons = {s.name: s.cron for s in config.schedules}
        self._zone = ZoneInfo(config.timezone)
        self._take = take
        self._metrics = metrics
        self._clock = clock
        now = clock()
        self.due = {name: self._next(name, now) for name in self._crons}

    def _next(self, name: str, after: datetime) -> datetime:
        nxt: datetime = croniter(self._crons[name], after.astimezone(self._zone)).get_next(datetime)
        return nxt

    def run_due(self) -> None:
        """Run what's due now, then skip what came due meanwhile."""
        started = self._clock()
        for name in sorted(
            (n for n, t in self.due.items() if t <= started), key=self.due.__getitem__
        ):
            try:
                self._take(name)
            except Exception as exc:  # measured by the backup itself; the next one runs as usual
                log.error("backup failed", schedule=name, error=str(exc))
            self.due[name] = self._next(name, self.due[name])  # may have passed meanwhile
        now = self._clock()
        for name, t in self.due.items():
            if t <= now:
                log.warning(
                    "backup skipped: another was still running",
                    schedule=name,
                    due=t.isoformat(),
                )
                self._metrics.was_skipped(name, now)
                self.due[name] = self._next(name, now)

    def seconds_to_next(self) -> float:
        if not self.due:
            return MAX_SLEEP_S
        wait = (min(self.due.values()) - self._clock()).total_seconds()
        return min(max(wait, 0.0), MAX_SLEEP_S)

    def run_forever(self, sleep: Callable[[float], None] = time.sleep) -> None:
        while True:
            self.run_due()
            sleep(self.seconds_to_next())
