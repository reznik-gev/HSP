"""The API refuses to start on the wrong schema (docs/0056, docs/0109)."""

import pytest
from fastapi.testclient import TestClient

import hsp.main
from hsp.main import create_app
from hsp.readiness import SchemaMismatchError


async def fake_wrong_schema_check() -> None:
    raise SchemaMismatchError("the database schema is at old, but this version needs new")


@pytest.fixture
def wrong_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    """The startup check finds a schema this code wasn't written for."""
    monkeypatch.setattr(hsp.main, "check_schema_at_startup", fake_wrong_schema_check)


@pytest.mark.usefixtures("wrong_schema")
def test_the_api_refuses_to_start_on_the_wrong_schema() -> None:
    with pytest.raises(SchemaMismatchError, match="needs new"), TestClient(create_app()):
        pass
