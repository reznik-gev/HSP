"""Sessions: resolving the signed-in user from the session cookie, refreshing tokens, and the
admin and CSRF checks on writes (docs/0027, docs/0038, docs/0077)."""

from collections.abc import Iterator
from datetime import timedelta
from typing import Any

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
from hsp.auth.sessions import Session, SessionTokens, with_tokens
from hsp.auth.tokens import hash_token, new_session_token
from hsp.main import create_app
from tests.fakes import InMemorySessionStore
from tests.stubs import STUB_TENANT
from tests.unit.auth.stubs import stub_tokens

ADMIN_TOKENS = stub_tokens(roles=["hsp-admin"])
VIEWER_TOKENS = stub_tokens(roles=["default-roles-hsp"])


class SpyRefresher:
    """Refreshes a session's tokens to `result` (or refuses, when None) and counts the calls."""

    def __init__(self) -> None:
        self.result: SessionTokens | None = None
        self.calls = 0

    async def refresh(self, session: Session) -> Session | None:
        self.calls += 1
        return with_tokens(session, self.result) if self.result else None


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


async def sign_in(store: InMemorySessionStore, api: TestClient, tokens: SessionTokens) -> None:
    """Store a session holding `tokens` (CSRF token "csrf-1") and set its cookie on `api`."""
    cookie = new_session_token()
    await store.create(
        token_hash=hash_token(cookie),
        tenant_id=STUB_TENANT,
        subject="u1",
        csrf_token="csrf-1",
        tokens=tokens,
    )
    api.cookies.set("hsp_session", cookie)


# --- resolving the signed-in user -----------------------------------------------------------


def test_no_cookie_is_401_problem(probe_api: TestClient) -> None:
    r = probe_api.get("/_t/me")
    assert r.status_code == 401
    assert r.json()["type"].endswith("/not-authenticated")


async def test_valid_session_resolves_principal(
    session_store: InMemorySessionStore, probe_api: TestClient
) -> None:
    await sign_in(session_store, probe_api, ADMIN_TOKENS)
    r = probe_api.get("/_t/me")
    assert r.status_code == 200
    assert r.json() == {"subject": "u1", "name": "Dev Admin", "admin": True}


async def test_expired_session_is_deleted(
    session_store: InMemorySessionStore, probe_api: TestClient
) -> None:
    await sign_in(session_store, probe_api, stub_tokens(roles=[], session_in=timedelta(seconds=-1)))
    assert probe_api.get("/_t/me").status_code == 401
    assert session_store.by_hash == {}


async def test_expiring_access_token_is_refreshed(
    session_store: InMemorySessionStore, probe_api: TestClient, refresher: SpyRefresher
) -> None:
    await sign_in(session_store, probe_api, stub_tokens(roles=[], access_in=timedelta(seconds=5)))
    refresher.result = ADMIN_TOKENS
    r = probe_api.get("/_t/me")
    assert r.status_code == 200
    assert r.json()["admin"] is True  # roles come from the refreshed token
    assert refresher.calls == 1
    stored = next(iter(session_store.by_hash.values()))
    assert stored.tokens == ADMIN_TOKENS


async def test_refused_refresh_ends_session(
    session_store: InMemorySessionStore, probe_api: TestClient
) -> None:
    await sign_in(session_store, probe_api, stub_tokens(roles=[], access_in=timedelta(seconds=5)))
    assert probe_api.get("/_t/me").status_code == 401
    assert session_store.by_hash == {}


# --- admin and CSRF checks ------------------------------------------------------------------


async def test_admin_with_csrf_may_edit(
    session_store: InMemorySessionStore, probe_api: TestClient
) -> None:
    await sign_in(session_store, probe_api, ADMIN_TOKENS)
    assert probe_api.post("/_t/edit", headers={"X-CSRF-Token": "csrf-1"}).status_code == 200


@pytest.mark.parametrize("headers", [{}, {"X-CSRF-Token": "wrong"}])
async def test_missing_or_wrong_csrf_is_403(
    session_store: InMemorySessionStore, probe_api: TestClient, headers: dict[str, str]
) -> None:
    await sign_in(session_store, probe_api, ADMIN_TOKENS)
    r = probe_api.post("/_t/edit", headers=headers)
    assert r.status_code == 403
    assert r.json()["type"].endswith("/csrf-failed")


async def test_viewer_may_not_edit(
    session_store: InMemorySessionStore, probe_api: TestClient
) -> None:
    await sign_in(session_store, probe_api, VIEWER_TOKENS)
    r = probe_api.post("/_t/edit", headers={"X-CSRF-Token": "csrf-1"})
    assert r.status_code == 403
    assert r.json()["type"].endswith("/forbidden")
