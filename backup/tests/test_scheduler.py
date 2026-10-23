"""Schedules run at their cron times in their time zone; one that comes due during a backup is
skipped; a failure doesn't stop the next (docs/0106)."""

from datetime import UTC, datetime

from prometheus_client import CollectorRegistry
from structlog.testing import capture_logs

from hsp_backup.config import parse_config
from hsp_backup.metrics import BackupMetrics
from hsp_backup.scheduler import Scheduler
from tests.conftest import FakeClock

#: 02:30 UTC on 2026-10-21 is 05:30 in Jerusalem.
TWO_SCHEDULES = """
timezone: Asia/Jerusalem
targets: { local: { type: folder, path: /b } }
schedules:
  - { name: nightly, cron: "0 6 * * *", target: local, keep: 7 }
  - { name: hourly, cron: "0 * * * *", target: local, keep: 24 }
"""


#: A target and no schedules.
NO_SCHEDULES = "targets: { local: { type: folder, path: /b } }"


class SpyTake:
    """Records each backup taken; a backup takes `minutes`, and can be told to fail."""

    def __init__(self, clock: FakeClock) -> None:
        self.clock = clock
        self.taken: list[tuple[str, datetime]] = []
        self.minutes = 1.0
        self.failing: set[str] = set()

    def __call__(self, name: str) -> None:
        self.taken.append((name, self.clock.now))
        self.clock.advance(minutes=self.minutes)
        if name in self.failing:
            raise RuntimeError("disk full")


def scheduler_for(
    text: str, clock: FakeClock, take: SpyTake, registry: CollectorRegistry | None = None
) -> Scheduler:
    metrics = BackupMetrics(registry or CollectorRegistry())
    return Scheduler(parse_config(text), take, metrics, clock)


def utc(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 10, 21, hour, minute, tzinfo=UTC)


def test_cron_times_are_in_the_configured_time_zone(clock: FakeClock) -> None:
    s = scheduler_for(TWO_SCHEDULES, clock, SpyTake(clock))
    assert s.due["nightly"] == utc(3)  # 06:00 in Jerusalem
    assert s.due["hourly"] == utc(3)


def test_schedules_due_together_run_one_after_another(clock: FakeClock) -> None:
    take = SpyTake(clock)
    s = scheduler_for(TWO_SCHEDULES, clock, take)
    clock.now = utc(3)
    s.run_due()
    assert [name for name, _ in take.taken] == ["nightly", "hourly"]
    assert s.due["hourly"] == utc(4)
    assert s.due["nightly"] == datetime(2026, 10, 22, 3, tzinfo=UTC)


def test_a_schedule_due_during_a_long_backup_is_skipped(
    clock: FakeClock, registry: CollectorRegistry
) -> None:
    take = SpyTake(clock)
    s = scheduler_for(TWO_SCHEDULES, clock, take, registry)
    clock.now = utc(3)
    take.minutes = 90  # nightly runs until 04:30, past hourly's 04:00
    s.run_due()
    assert [name for name, _ in take.taken] == ["nightly", "hourly"]
    # hourly then ran 04:30-06:00, so 04:00, 05:00 and 06:00 passed during backups: skipped
    assert s.due["hourly"] == utc(7)
    skipped = registry.get_sample_value(
        "hsp_backup_last_skipped_timestamp_seconds", {"schedule": "hourly"}
    )
    assert skipped == utc(6).timestamp()
    assert s.due["nightly"] == datetime(2026, 10, 22, 3, tzinfo=UTC)  # not skipped


def test_a_failure_is_logged_and_doesnt_stop_the_next_backup(clock: FakeClock) -> None:
    take = SpyTake(clock)
    take.failing = {"nightly"}
    s = scheduler_for(TWO_SCHEDULES, clock, take)
    clock.now = utc(3)
    with capture_logs() as logs:
        s.run_due()
    assert [name for name, _ in take.taken] == ["nightly", "hourly"]
    assert {"event": "backup failed", "schedule": "nightly", "error": "disk full"}.items() <= (
        logs[0].items()
    )


def test_it_sleeps_until_the_next_time_but_at_most_a_minute(clock: FakeClock) -> None:
    s = scheduler_for(TWO_SCHEDULES, clock, SpyTake(clock))
    assert s.seconds_to_next() == 60.0  # next is 03:00, half an hour away
    clock.now = utc(2, 59).replace(second=30)
    assert s.seconds_to_next() == 30.0


def test_no_schedules_means_nothing_runs(clock: FakeClock) -> None:
    take = SpyTake(clock)
    s = scheduler_for(NO_SCHEDULES, clock, take)
    s.run_due()
    assert take.taken == []
    assert s.seconds_to_next() == 60.0
