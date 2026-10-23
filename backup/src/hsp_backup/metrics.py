"""The backup service's metrics, on port 9465 (docs/0106). Alerting on backup age is the
operator's Prometheus: e.g. time() - hsp_backup_last_success_timestamp_seconds > 26 * 3600."""

import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime

from prometheus_client import REGISTRY, CollectorRegistry, Gauge

PORT = 9465


@dataclass
class Run:
    """One backup being measured; its size is known only once it's written."""

    size: int = 0


class BackupMetrics:
    def __init__(self, registry: CollectorRegistry = REGISTRY) -> None:
        def gauge(name: str, doc: str) -> Gauge:
            return Gauge(name, doc, ["schedule"], registry=registry)

        self.last_success = gauge(
            "hsp_backup_last_success_timestamp_seconds", "When the schedule last backed up"
        )
        self.last_failure = gauge(
            "hsp_backup_last_failure_timestamp_seconds", "When the schedule last failed"
        )
        self.duration = gauge("hsp_backup_duration_seconds", "How long the last backup took")
        self.size = gauge("hsp_backup_size_bytes", "The size of the last backup")
        self.skipped = gauge(
            "hsp_backup_last_skipped_timestamp_seconds",
            "When the schedule was last skipped because another backup was still running",
        )

    @contextmanager
    def measure(self, schedule: str, taken: datetime) -> Iterator[Run]:
        """Measure the backup taken at `taken` in the block: a success with its duration and
        size, or a failure if the block raises."""
        run = Run()
        started = time.monotonic()
        try:
            yield run
        except Exception:
            self.failed(schedule, taken)
            raise
        self.succeeded(schedule, taken, time.monotonic() - started, run.size)

    def succeeded(self, schedule: str, at: datetime, seconds: float, size: int) -> None:
        self.last_success.labels(schedule).set(at.timestamp())
        self.duration.labels(schedule).set(seconds)
        self.size.labels(schedule).set(size)

    def failed(self, schedule: str, at: datetime) -> None:
        self.last_failure.labels(schedule).set(at.timestamp())

    def was_skipped(self, schedule: str, at: datetime) -> None:
        self.skipped.labels(schedule).set(at.timestamp())
