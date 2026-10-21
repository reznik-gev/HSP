"""Prometheus metrics: requests by route, changesets and publishes, lock refusals, and the sum
over every worker process (docs/0057, docs/0105)."""

import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY, CollectorRegistry

from hsp import metrics
from hsp.main import create_app
from hsp.problems import ProblemException
from hsp.serve import reset_metrics_dir

BACKEND_DIR = Path(__file__).resolve().parents[2]


@pytest.fixture
def probe_app() -> FastAPI:
    """The app plus probe routes: one with a path parameter, and one refused for the edit lock."""
    app = create_app()

    @app.get("/_test/items/{item_id}")
    async def item(item_id: str) -> dict[str, str]:
        return {"id": item_id}

    @app.post("/_test/locked")
    async def locked() -> None:
        raise ProblemException(423, "floor-locked", "Floor is being edited")

    return app


@pytest.fixture
def probe_api(probe_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(probe_app) as client:
        yield client


def sample(name: str, registry: CollectorRegistry = REGISTRY, **labels: str) -> float:
    return registry.get_sample_value(name, labels) or 0.0


def test_requests_are_counted_and_timed_by_route_template(probe_api: TestClient) -> None:
    labels = {"method": "GET", "route": "/_test/items/{item_id}"}
    before = sample("hsp_http_requests_total", **labels, status="200")
    timed_before = sample("hsp_http_request_duration_seconds_count", **labels)

    probe_api.get("/_test/items/1")
    probe_api.get("/_test/items/2")

    assert sample("hsp_http_requests_total", **labels, status="200") == before + 2
    assert sample("hsp_http_request_duration_seconds_count", **labels) == timed_before + 2


def test_unknown_paths_share_one_route_label(probe_api: TestClient) -> None:
    labels = {"method": "GET", "route": "unmatched", "status": "404"}
    before = sample("hsp_http_requests_total", **labels)
    probe_api.get("/no/such/path/1")
    probe_api.get("/no/such/path/2")
    assert sample("hsp_http_requests_total", **labels) == before + 2


def test_lock_refusals_are_counted(probe_api: TestClient) -> None:
    before = sample("hsp_lock_refusals_total", type="floor-locked")
    assert probe_api.post("/_test/locked").status_code == 423
    assert sample("hsp_lock_refusals_total", type="floor-locked") == before + 1


def test_metrics_are_served_in_the_prometheus_format(probe_api: TestClient) -> None:
    probe_api.get("/_test/items/1")
    r = probe_api.get("/metrics")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/plain")
    assert "hsp_http_requests_total{" in r.text


def test_metrics_are_not_counted_as_requests(probe_api: TestClient) -> None:
    probe_api.get("/metrics")
    assert sample("hsp_http_requests_total", method="GET", route="/metrics", status="200") == 0


def test_an_observed_operation_counts_its_outcome_and_time() -> None:
    labels = {"operation": "publish"}
    ok = sample("hsp_plan_operations_total", **labels, outcome="ok")
    refused = sample("hsp_plan_operations_total", **labels, outcome="refused")
    timed = sample("hsp_plan_operation_duration_seconds_count", **labels)

    with metrics.observed("publish"):
        pass
    with pytest.raises(ProblemException), metrics.observed("publish"):
        raise ProblemException(409, "publish-conflicts", "Conflicts")

    assert sample("hsp_plan_operations_total", **labels, outcome="ok") == ok + 1
    assert sample("hsp_plan_operations_total", **labels, outcome="refused") == refused + 1
    assert sample("hsp_plan_operation_duration_seconds_count", **labels) == timed + 2


# --- several workers ------------------------------------------------------------------------


def count_in_a_worker(metrics_dir: Path) -> None:
    """A separate process, as a uvicorn worker is, counting one request."""
    subprocess.run(
        [
            sys.executable,
            "-c",
            "from hsp import metrics; "
            "metrics.HTTP_REQUESTS.labels(method='GET', route='/x', status='200').inc()",
        ],
        cwd=BACKEND_DIR,
        env={**os.environ, "PROMETHEUS_MULTIPROC_DIR": str(metrics_dir)},
        check=True,
    )


def test_the_metrics_server_adds_up_every_worker(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    count_in_a_worker(tmp_path)
    count_in_a_worker(tmp_path)
    monkeypatch.setenv("PROMETHEUS_MULTIPROC_DIR", str(tmp_path))

    registry = metrics.registry()

    assert sample("hsp_http_requests_total", registry, method="GET", route="/x", status="200") == 2
    assert sample("process_resident_memory_bytes", registry) > 0


def test_a_restart_starts_counting_from_zero(tmp_path: Path) -> None:
    count_in_a_worker(tmp_path)
    reset_metrics_dir(tmp_path)
    assert list(tmp_path.iterdir()) == []
