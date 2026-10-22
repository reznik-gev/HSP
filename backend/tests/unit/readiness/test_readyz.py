"""/readyz is ready when every check passes, and otherwise names each check that failed
(docs/0105)."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hsp.problems import PROBLEM_JSON
from hsp.readiness import Readiness


async def fake_passing_check() -> str | None:
    return None


async def fake_database_down_problem() -> str | None:
    return "database unreachable (OSError)"


async def fake_keycloak_down_problem() -> str | None:
    return "Keycloak answered 503"


@pytest.fixture
def every_check_passes(app: FastAPI) -> None:
    """The app's /readyz checks all pass."""
    app.state.readiness = Readiness(
        {"database": fake_passing_check, "keycloak": fake_passing_check}
    )


@pytest.fixture
def database_and_keycloak_down(app: FastAPI) -> None:
    """The app's /readyz finds neither the database nor Keycloak."""
    app.state.readiness = Readiness(
        {"database": fake_database_down_problem, "keycloak": fake_keycloak_down_problem}
    )


@pytest.mark.usefixtures("every_check_passes")
def test_ready_when_every_check_passes(api: TestClient) -> None:
    r = api.get("/readyz")
    assert r.status_code == 200
    assert r.json()["status"] == "ready"


@pytest.mark.usefixtures("database_and_keycloak_down")
def test_not_ready_names_each_failed_check(api: TestClient) -> None:
    r = api.get("/readyz")
    assert r.status_code == 503
    assert r.headers["content-type"] == PROBLEM_JSON
    body = r.json()
    assert body["type"].endswith("/not-ready")
    assert body["detail"] == (
        "database: database unreachable (OSError); keycloak: Keycloak answered 503"
    )
