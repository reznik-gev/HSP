"""One log line per request: route template, status, time taken and who made it (docs/0105)."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from structlog.testing import capture_logs

from hsp.config import get_settings
from hsp.main import create_app

#: A floor that may not exist; its route is matched either way.
SOME_FLOOR_URL = "/api/v1/floors/0193e3d2-0000-7000-8000-000000000001"


@pytest.fixture
def actor_subject() -> str:
    """The signed-in user who calls the probe route."""
    return "u1"


@pytest.fixture
def probe_app(actor_subject: str) -> FastAPI:
    """The app plus a probe route with a path parameter, called by `actor_subject`."""
    app = create_app()

    @app.get("/_test/items/{item_id}")
    async def item(item_id: str, request: Request) -> dict[str, str]:
        request.state.actor_subject = actor_subject
        return {"id": item_id}

    @app.get("/_test/crash")
    async def crash() -> None:
        raise RuntimeError("boom")

    return app


@pytest.fixture
def probe_api(probe_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(probe_app) as client:
        yield client


@pytest.fixture
def api_that_survives_crashes(probe_app: FastAPI) -> Iterator[TestClient]:
    """A client of `probe_app` that gets a 500 from a crash, as a browser would."""
    with TestClient(probe_app, raise_server_exceptions=False) as client:
        yield client


@pytest.fixture
def debug_api(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """A client of the app with HSP_LOG_LEVEL=DEBUG."""
    monkeypatch.setenv("HSP_LOG_LEVEL", "DEBUG")
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        yield client
    get_settings.cache_clear()


def request_lines(logs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [line for line in logs if line["event"] == "request"]


def test_a_request_is_logged_once_with_its_route_template(
    probe_api: TestClient, actor_subject: str
) -> None:
    with capture_logs() as logs:
        r = probe_api.get("/_test/items/42?q=secret", headers={"X-Request-ID": "rid-1"})

    [line] = request_lines(logs)
    assert line["method"] == "GET"
    assert line["route"] == "/_test/items/{item_id}"
    assert line["status"] == r.status_code == 200
    assert isinstance(line["duration_ms"], int) and line["duration_ms"] >= 0
    assert line["request_id"] == "rid-1"
    assert line["actor_subject"] == actor_subject
    assert line["log_level"] == "info"


def test_the_raw_path_is_not_logged_above_debug_level(probe_api: TestClient) -> None:
    with capture_logs() as logs:
        probe_api.get("/_test/items/42?q=secret")

    [line] = request_lines(logs)
    assert "path" not in line


def test_routes_under_api_v1_are_logged_in_full(probe_api: TestClient) -> None:
    with capture_logs() as logs:
        probe_api.get(SOME_FLOOR_URL)

    [line] = request_lines(logs)
    assert line["route"] == "/api/v1/floors/{floor_id}"


def test_the_raw_path_is_logged_at_debug_level(debug_api: TestClient) -> None:
    with capture_logs() as logs:
        debug_api.get("/api/v1/does-not-exist?q=x")

    [line] = request_lines(logs)
    assert line["path"] == "/api/v1/does-not-exist?q=x"


def test_sign_in_codes_are_never_logged(debug_api: TestClient) -> None:
    with capture_logs() as logs:
        debug_api.get("/api/v1/auth/callback?code=one-time&state=s")

    [line] = request_lines(logs)
    assert line["path"] == "/api/v1/auth/callback"


def test_an_unknown_path_has_no_route_and_no_user(probe_api: TestClient) -> None:
    with capture_logs() as logs:
        probe_api.get("/api/v1/does-not-exist")

    [line] = request_lines(logs)
    assert line["route"] is None
    assert line["status"] == 404
    assert line["actor_subject"] is None


def test_a_crashed_request_is_logged_as_500(api_that_survives_crashes: TestClient) -> None:
    with capture_logs() as logs:
        api_that_survives_crashes.get("/_test/crash")

    [line] = request_lines(logs)
    assert line["route"] == "/_test/crash"
    assert line["status"] == 500


@pytest.mark.parametrize("path", ["/healthz", "/readyz", "/metrics"])
def test_health_and_metrics_are_not_logged(probe_api: TestClient, path: str) -> None:
    with capture_logs() as logs:
        probe_api.get(path)

    assert request_lines(logs) == []
