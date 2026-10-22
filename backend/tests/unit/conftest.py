"""Fixtures for the API unit tests: the app with its signed-in user and fakes plugged in
(docs/0061). Repositories are faked; nothing here needs a database."""

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import hsp.main
from hsp.api.common import get_locations_repository
from hsp.auth.dependencies import get_principal
from hsp.auth.principal import Principal
from hsp.main import create_app
from tests.fakes import InMemoryLocationsRepository
from tests.stubs import STUB_CSRF_HEADER_NAME, STUB_CSRF_TOKEN, stub_admin, stub_viewer
from tests.unit.api_helpers import SignedIn


async def skip_schema_check() -> None:
    pass


@pytest.fixture(autouse=True)
def no_database_at_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unit tests have no database, so the app skips its schema check at startup (docs/0109)."""
    monkeypatch.setattr(hsp.main, "check_schema_at_startup", skip_schema_check)


@pytest.fixture
def admin() -> Principal:
    """Alice, an admin."""
    return stub_admin()


@pytest.fixture
def other_admin() -> Principal:
    """Bob, another admin of the same tenant."""
    return stub_admin(subject="bob", name="Bob")


@pytest.fixture
def viewer() -> Principal:
    """Vic, who can read but not write."""
    return stub_viewer()


@pytest.fixture
def signed_in(admin: Principal) -> SignedIn:
    """Who the requests run as: `admin`, until a test sets `signed_in.principal` to someone else."""
    return SignedIn(admin)


@pytest.fixture
def app(signed_in: SignedIn) -> FastAPI:
    """The app, with every request signed in as `signed_in.principal`."""
    app = create_app()
    app.dependency_overrides[get_principal] = lambda: signed_in.principal
    return app


@pytest.fixture
def api(app: FastAPI) -> Iterator[TestClient]:
    """A client of `app` that sends the CSRF header a write needs (docs/0038)."""
    with TestClient(app, headers={STUB_CSRF_HEADER_NAME: STUB_CSRF_TOKEN}) as client:
        yield client


@pytest.fixture
def api_without_csrf(app: FastAPI) -> Iterator[TestClient]:
    """A client of `app` that sends no CSRF header, so its writes are refused."""
    with TestClient(app) as client:
        yield client


@pytest.fixture
def locations_repo(app: FastAPI) -> InMemoryLocationsRepository:
    """An empty in-memory store of sites, buildings and floors, plugged into the app."""
    repo = InMemoryLocationsRepository()
    app.dependency_overrides[get_locations_repository] = lambda: repo
    return repo
