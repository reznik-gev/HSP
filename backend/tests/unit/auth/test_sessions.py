"""Sessions: resolving the signed-in user from the session cookie, and refreshing tokens
(docs/0027, docs/0077)."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from structlog.testing import capture_logs

from hsp.auth.sessions import SessionTokens
from tests.fakes import InMemorySessionStore
from tests.unit.auth.session_helpers import SignIn, SpyRefresher
from tests.unit.auth.stubs import stub_tokens


@pytest.fixture
def expired_session_tokens(signed_in_subject: str) -> SessionTokens:
    return stub_tokens(subject=signed_in_subject, roles=[], session_in=timedelta(seconds=-1))


@pytest.fixture
def expiring_access_tokens(signed_in_subject: str) -> SessionTokens:
    """Tokens whose access token is about to expire, so the next request refreshes it."""
    return stub_tokens(subject=signed_in_subject, roles=[], access_in=timedelta(seconds=5))


def test_no_cookie_is_401_problem(probe_api: TestClient) -> None:
    r = probe_api.get("/_t/me")
    assert r.status_code == 401
    assert r.json()["type"].endswith("/not-authenticated")


async def test_valid_session_resolves_principal(
    sign_in: SignIn, probe_api: TestClient, admin_tokens: SessionTokens, signed_in_subject: str
) -> None:
    await sign_in(admin_tokens)
    r = probe_api.get("/_t/me")
    assert r.status_code == 200
    assert r.json() == {"subject": signed_in_subject, "name": "Dev Admin", "admin": True}


async def test_the_request_log_names_the_signed_in_user(
    sign_in: SignIn, probe_api: TestClient, viewer_tokens: SessionTokens, signed_in_subject: str
) -> None:
    await sign_in(viewer_tokens)
    with capture_logs() as logs:
        probe_api.get("/_t/me")
    [line] = [line for line in logs if line["event"] == "request"]
    assert line["actor_subject"] == signed_in_subject


async def test_expired_session_is_deleted(
    sign_in: SignIn,
    probe_api: TestClient,
    session_store: InMemorySessionStore,
    expired_session_tokens: SessionTokens,
) -> None:
    await sign_in(expired_session_tokens)
    assert probe_api.get("/_t/me").status_code == 401
    assert session_store.by_hash == {}


async def test_expiring_access_token_is_refreshed(
    sign_in: SignIn,
    probe_api: TestClient,
    session_store: InMemorySessionStore,
    refresher: SpyRefresher,
    expiring_access_tokens: SessionTokens,
    admin_tokens: SessionTokens,
) -> None:
    await sign_in(expiring_access_tokens)
    refresher.result = admin_tokens
    r = probe_api.get("/_t/me")
    assert r.status_code == 200
    assert r.json()["admin"] is True  # roles come from the refreshed token
    assert refresher.calls == 1
    stored = next(iter(session_store.by_hash.values()))
    assert stored.tokens == admin_tokens


async def test_refused_refresh_ends_session(
    sign_in: SignIn,
    probe_api: TestClient,
    session_store: InMemorySessionStore,
    expiring_access_tokens: SessionTokens,
) -> None:
    await sign_in(expiring_access_tokens)
    assert probe_api.get("/_t/me").status_code == 401
    assert session_store.by_hash == {}
