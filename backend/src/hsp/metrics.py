"""Prometheus metrics (docs/0057, docs/0105).

With PROMETHEUS_MULTIPROC_DIR set (the image sets it), each uvicorn worker writes its values to
files in that folder, and `registry()` adds them up for the metrics server (hsp/serve.py). Without
it, as in development and tests, everything stays in this process.

Labels hold route templates, never raw paths, so there's no personal data and no unbounded set.
"""

import os
import time
from collections.abc import Iterable, Iterator
from contextlib import contextmanager

import psutil
from prometheus_client import (
    REGISTRY,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    multiprocess,
)
from prometheus_client.core import CounterMetricFamily, GaugeMetricFamily, Metric
from prometheus_client.registry import Collector

from hsp.problems import ProblemException

#: The route label of a request no route matched (a 404), so random paths add no new series.
UNMATCHED = "unmatched"

HTTP_REQUESTS = Counter(
    "hsp_http_requests_total", "HTTP requests answered", ["method", "route", "status"]
)
HTTP_DURATION = Histogram(
    "hsp_http_request_duration_seconds", "Time to answer an HTTP request", ["method", "route"]
)
DB_CONNECTIONS = Gauge(
    "hsp_db_connections_in_use",
    "Database connections checked out of the pool",
    multiprocess_mode="livesum",
)
PLAN_OPERATIONS = Counter(
    "hsp_plan_operations_total",
    "Changesets and publishes, by outcome: ok, refused (a problem answer) or error",
    ["operation", "outcome"],
)
PLAN_OPERATION_DURATION = Histogram(
    "hsp_plan_operation_duration_seconds", "Time to apply a changeset or publish", ["operation"]
)
LOCK_REFUSALS = Counter(
    "hsp_lock_refusals_total",
    "Writes refused for the floor's edit lock: lock-required (409) or floor-locked (423)",
    ["type"],
)

#: Problem types that mean "the edit lock refused you" (docs/0016).
LOCK_PROBLEMS = frozenset({"lock-required", "floor-locked"})


def record_request(method: str, route: str | None, status: int, seconds: float) -> None:
    route = route or UNMATCHED
    HTTP_REQUESTS.labels(method=method, route=route, status=str(status)).inc()
    HTTP_DURATION.labels(method=method, route=route).observe(seconds)


def record_problem(slug: str) -> None:
    if slug in LOCK_PROBLEMS:
        LOCK_REFUSALS.labels(type=slug).inc()


@contextmanager
def observed(operation: str) -> Iterator[None]:
    """Count and time a plan operation ("changeset" or "publish") by its outcome."""
    started = time.perf_counter()
    outcome = "error"
    try:
        yield
        outcome = "ok"
    except ProblemException:
        outcome = "refused"
        raise
    finally:
        PLAN_OPERATIONS.labels(operation=operation, outcome=outcome).inc()
        PLAN_OPERATION_DURATION.labels(operation=operation).observe(time.perf_counter() - started)


class ProcessTreeCollector(Collector):
    """CPU and memory of this process and all its children: the launcher and every uvicorn
    worker, which the standard process collector would report one at a time."""

    def collect(self) -> Iterable[Metric]:
        me = psutil.Process()
        processes = [me, *me.children(recursive=True)]
        cpu, rss = 0.0, 0
        for p in processes:
            try:
                times = p.cpu_times()
                cpu += times.user + times.system
                rss += p.memory_info().rss
            except psutil.NoSuchProcess:
                continue
        yield CounterMetricFamily("process_cpu_seconds", "CPU time of the API's processes", cpu)
        yield GaugeMetricFamily(
            "process_resident_memory_bytes", "Resident memory of the API's processes", rss
        )
        yield GaugeMetricFamily("process_count", "The API's processes", len(processes))


def registry() -> CollectorRegistry:
    """What /metrics reports: every worker's values when PROMETHEUS_MULTIPROC_DIR is set,
    otherwise this process's."""
    if not os.environ.get("PROMETHEUS_MULTIPROC_DIR"):
        return REGISTRY
    combined = CollectorRegistry()
    multiprocess.MultiProcessCollector(combined)  # type: ignore[no-untyped-call]
    combined.register(ProcessTreeCollector())
    return combined
