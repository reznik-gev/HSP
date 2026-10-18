"""Fixtures for the sign-in tests: the session store, and the app logging in against a fake
identity provider (docs/0077)."""

from collections.abc import Iterator

import httpx2
import pytest
from fastapi.testclient import TestClient

from hsp.auth.dependencies import get_session_store
from hsp.auth.oidc import OidcClient
from hsp.config import Settings, get_settings
from hsp.main import create_app
from hsp.tenancy import get_tenant_id
from tests.fakes import InMemorySessionStore
from tests.stubs import STUB_TENANT
from tests.unit.auth.fake_idp import ISSUER, PUBLIC, FakeIdP


@pytest.fixture
def session_store() -> InMemorySessionStore:
    return InMemorySessionStore()


@pytest.fixture
def idp() -> FakeIdP:
    return FakeIdP()


@pytest.fixture
def api_with_fake_idp(idp: FakeIdP, session_store: InMemorySessionStore) -> Iterator[TestClient]:
    """The app served at PUBLIC, signing in against `idp`. Redirects aren't followed, so a test
    sees where each step sends the browser."""
    settings = Settings(environment="development", public_url=PUBLIC, oidc_issuer_url=ISSUER)
    app = create_app()
    app.state.oidc = OidcClient(settings, transport=httpx2.MockTransport(idp.handle))
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_session_store] = lambda: session_store
    app.dependency_overrides[get_tenant_id] = lambda: STUB_TENANT
    with TestClient(app, follow_redirects=False) as client:
        yield client
