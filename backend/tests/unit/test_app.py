"""Unit tests for the app shell: health, request IDs and Problem Details (docs/0037, 0057)."""

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from hsp.main import create_app
from hsp.problems import PROBLEM_JSON, ProblemError, ProblemException


class Payload(BaseModel):
    width_mm: int


@pytest.fixture
def probe_app() -> FastAPI:
    """The app plus two probe routes: one validating a body, one raising a domain problem."""
    app = create_app()

    @app.post("/_test/validate")
    async def validate(_: Payload) -> dict[str, str]:
        return {"ok": "yes"}

    @app.get("/_test/domain-error")
    async def domain_error() -> None:
        raise ProblemException(
            422,
            "changeset-invalid",
            "Changeset violates floor invariants",
            errors=[ProblemError(code="opening_exceeds_wall", message="too long", op_index=0)],
        )

    return app


@pytest.fixture
def probe_api(probe_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(probe_app) as client:
        yield client


def test_healthz(probe_api: TestClient) -> None:
    r = probe_api.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_request_id_is_generated_and_echoed(probe_api: TestClient) -> None:
    assert probe_api.get("/healthz").headers["X-Request-ID"]
    assert (
        probe_api.get("/healthz", headers={"X-Request-ID": "abc"}).headers["X-Request-ID"] == "abc"
    )


def test_not_found_is_problem_json(probe_api: TestClient) -> None:
    r = probe_api.get("/api/v1/does-not-exist")
    assert r.status_code == 404
    assert r.headers["content-type"] == PROBLEM_JSON
    body = r.json()
    assert body["status"] == 404
    assert body["instance"] == "/api/v1/does-not-exist"
    assert body["request_id"] == r.headers["X-Request-ID"]


def test_request_validation_uses_json_pointer(probe_api: TestClient) -> None:
    r = probe_api.post("/_test/validate", json={"width_mm": "wide"})
    assert r.status_code == 422
    body = r.json()
    assert body["type"].endswith("/request-invalid")
    assert body["errors"][0]["pointer"] == "/width_mm"


def test_domain_problem(probe_api: TestClient) -> None:
    r = probe_api.get("/_test/domain-error")
    assert r.status_code == 422
    body = r.json()
    assert body["type"].endswith("/changeset-invalid")
    assert body["errors"] == [
        {"code": "opening_exceeds_wall", "message": "too long", "op_index": 0}
    ]


def test_openapi_is_versioned_and_generates() -> None:
    schema = create_app().openapi()
    assert schema["info"]["title"] == "HSP API"
    assert "/healthz" in schema["paths"]
