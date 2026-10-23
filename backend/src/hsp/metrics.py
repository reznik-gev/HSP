"""Prometheus metrics (docs/0057, docs/0105).

With PROMETHEUS_MULTIPROC_DIR set (the image sets it), each uvicorn worker writes its values to
files in that folder, and `registry()` adds them up for the metrics server (hsp/serve.py). Without
it, as in development and tests, everything stays in this process.

Labels hold route templates, never raw paths, so there's no personal data and no unbounded set.
The API's CPU and memory come from the platform, such as `docker stats`, cAdvisor or Kubernetes,
not from here (docs/0111).
"""

import os
import time
from collections.abc import Iterator
from contextlib import contextmanager

from prometheus_client import (
    REGISTRY,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    multiprocess,
)
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine

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


def count_connections(engine: AsyncEngine) -> None:
    """Keep hsp_db_connections_in_use exact: up when the pool hands a connection out, down when
    it's returned, in every worker (hsp/db.py calls this when it creates the engine)."""
    event.listen(engine.sync_engine, "checkout", lambda *_: DB_CONNECTIONS.inc())
    event.listen(engine.sync_engine, "checkin", lambda *_: DB_CONNECTIONS.dec())


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


def registry() -> CollectorRegistry:
    """What /metrics reports: every worker's values when PROMETHEUS_MULTIPROC_DIR is set,
    otherwise this process's."""
    if not os.environ.get("PROMETHEUS_MULTIPROC_DIR"):
        return REGISTRY
    combined = CollectorRegistry()
    multiprocess.MultiProcessCollector(combined)  # type: ignore[no-untyped-call]
    return combined
