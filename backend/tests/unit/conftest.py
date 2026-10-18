"""Fixtures for the API unit tests: the app with its signed-in user and fakes plugged in
(docs/0061). Repositories are faked; nothing here needs a database."""

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hsp.api.common import get_locations_repository
from hsp.auth.dependencies import get_principal
from hsp.main import create_app
from tests.fakes import InMemoryLocationsRepository
from tests.unit.api_helpers import SignedIn


@pytest.fixture
def signed_in() -> SignedIn:
    """The admin STUB_ADMIN, until a test signs in as someone else."""
    return SignedIn()


@pytest.fixture
def app(signed_in: SignedIn) -> FastAPI:
    """The app, with every request signed in as `signed_in.principal`."""
    app = create_app()
    app.dependency_overrides[get_principal] = lambda: signed_in.principal
    return app


@pytest.fixture
def api(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


@pytest.fixture
def locations_repo(app: FastAPI) -> InMemoryLocationsRepository:
    """An empty in-memory store of sites, buildings and floors, plugged into the app."""
    repo = InMemoryLocationsRepository()
    app.dependency_overrides[get_locations_repository] = lambda: repo
    return repo
