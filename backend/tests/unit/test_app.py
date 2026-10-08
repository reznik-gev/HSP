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
def app() -> FastAPI:
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
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def test_healthz(client: TestClient) -> None:
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_request_id_is_generated_and_echoed(client: TestClient) -> None:
    assert client.get("/healthz").headers["X-Request-ID"]
    assert client.get("/healthz", headers={"X-Request-ID": "abc"}).headers["X-Request-ID"] == "abc"


def test_not_found_is_problem_json(client: TestClient) -> None:
    r = client.get("/api/v1/does-not-exist")
    assert r.status_code == 404
    assert r.headers["content-type"] == PROBLEM_JSON
    body = r.json()
    assert body["status"] == 404
    assert body["instance"] == "/api/v1/does-not-exist"
    assert body["request_id"] == r.headers["X-Request-ID"]


def test_request_validation_uses_json_pointer(client: TestClient) -> None:
    r = client.post("/_test/validate", json={"width_mm": "wide"})
    assert r.status_code == 422
    body = r.json()
    assert body["type"].endswith("/request-invalid")
    assert body["errors"][0]["pointer"] == "/width_mm"


def test_domain_problem(client: TestClient) -> None:
    r = client.get("/_test/domain-error")
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
