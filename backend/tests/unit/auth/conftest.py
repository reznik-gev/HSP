"""Fixtures for the sign-in tests: the session store, the app logging in against a fake
identity provider (docs/0077), and a signed-in session on an app with probe routes."""

from collections.abc import Iterator
from typing import Any

import httpx2
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from hsp.auth.dependencies import (
    CurrentPrincipal,
    get_session_store,
    get_token_refresher,
    require_admin,
    require_csrf,
)
from hsp.auth.oidc import OidcClient
from hsp.auth.sessions import SessionTokens
from hsp.auth.tokens import hash_token, new_session_token
from hsp.config import Settings, get_settings
from hsp.main import create_app
from hsp.tenancy import get_tenant_id
from tests.fakes import InMemorySessionStore
from tests.stubs import STUB_CSRF_TOKEN, STUB_TENANT
from tests.unit.auth.fake_idp import ISSUER, PUBLIC, FakeIdP
from tests.unit.auth.session_helpers import SignIn, SpyRefresher
from tests.unit.auth.stubs import stub_tokens


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


@pytest.fixture
def signed_in_subject() -> str:
    """The user whose session `sign_in` stores."""
    return "u1"


@pytest.fixture
def admin_tokens(signed_in_subject: str) -> SessionTokens:
    return stub_tokens(subject=signed_in_subject, roles=["hsp-admin"])


@pytest.fixture
def viewer_tokens(signed_in_subject: str) -> SessionTokens:
    return stub_tokens(subject=signed_in_subject, roles=["default-roles-hsp"])


@pytest.fixture
def refresher() -> SpyRefresher:
    return SpyRefresher()


@pytest.fixture
def probe_api(session_store: InMemorySessionStore, refresher: SpyRefresher) -> Iterator[TestClient]:
    """The app plus two probe routes: /_t/me shows the signed-in user, and /_t/edit is a write
    that needs an admin and the CSRF token."""
    app = create_app()

    @app.get("/_t/me")
    async def me(p: CurrentPrincipal) -> dict[str, Any]:
        return {"subject": p.subject, "name": p.name, "admin": p.is_admin}

    @app.post("/_t/edit", dependencies=[Depends(require_csrf), Depends(require_admin)])
    async def edit() -> dict[str, str]:
        return {"ok": "yes"}

    app.dependency_overrides[get_session_store] = lambda: session_store
    app.dependency_overrides[get_token_refresher] = lambda: refresher
    with TestClient(app) as client:
        yield client


@pytest.fixture
def sign_in(
    session_store: InMemorySessionStore, probe_api: TestClient, signed_in_subject: str
) -> SignIn:
    """Signs `signed_in_subject` in to `probe_api` with the given tokens and STUB_CSRF_TOKEN."""

    async def sign_in(tokens: SessionTokens) -> None:
        cookie = new_session_token()
        await session_store.create(
            token_hash=hash_token(cookie),
            tenant_id=STUB_TENANT,
            subject=signed_in_subject,
            csrf_token=STUB_CSRF_TOKEN,
            tokens=tokens,
        )
        probe_api.cookies.set("hsp_session", cookie)

    return sign_in
