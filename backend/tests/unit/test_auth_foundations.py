"""Auth foundations: settings guard, token secrets, principal resolution, admin and CSRF checks
(docs/0027, docs/0038, docs/0077)."""

import base64
import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from pydantic import ValidationError

from hsp.auth.dependencies import (
    CurrentPrincipal,
    get_session_store,
    get_token_refresher,
    require_admin,
    require_csrf,
)
from hsp.auth.principal import jwt_claims, realm_roles
from hsp.auth.sessions import Session, SessionTokens, with_tokens
from hsp.auth.tokens import TokenCipher, TokenDecryptError, hash_token, new_session_token
from hsp.config import DEV_SESSION_ENCRYPTION_KEY, Settings
from hsp.main import create_app
from hsp.models import new_id
from tests.fakes import InMemorySessionStore

TENANT = new_id()


def fake_jwt(claims: dict[str, Any]) -> str:
    def b64(obj: dict[str, Any]) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()

    return f"{b64({'alg': 'none'})}.{b64(claims)}.sig"


def tokens(
    *,
    roles: list[str],
    access_in: timedelta = timedelta(minutes=5),
    session_in: timedelta = timedelta(hours=1),
) -> SessionTokens:
    now = datetime.now(UTC)
    return SessionTokens(
        access_token=fake_jwt(
            {
                "sub": "u1",
                "name": "Dev Admin",
                "email": "a@hsp.local",
                "realm_access": {"roles": roles},
            }
        ),
        access_expires_at=now + access_in,
        refresh_token="refresh",
        id_token=None,
        expires_at=now + session_in,
    )


class StubRefresher:
    def __init__(self, result: SessionTokens | None) -> None:
        self.result = result
        self.calls = 0

    async def refresh(self, session: Session) -> Session | None:
        self.calls += 1
        return with_tokens(session, self.result) if self.result else None


@pytest.fixture
def store() -> InMemorySessionStore:
    return InMemorySessionStore()


@pytest.fixture
def refresher() -> StubRefresher:
    return StubRefresher(None)


@pytest.fixture
def client(store: InMemorySessionStore, refresher: StubRefresher) -> Iterator[TestClient]:
    app = create_app()

    @app.get("/_t/me")
    async def me(p: CurrentPrincipal) -> dict[str, Any]:
        return {"subject": p.subject, "name": p.name, "admin": p.is_admin}

    @app.post("/_t/edit", dependencies=[Depends(require_csrf), Depends(require_admin)])
    async def edit() -> dict[str, str]:
        return {"ok": "yes"}

    app.dependency_overrides[get_session_store] = lambda: store
    app.dependency_overrides[get_token_refresher] = lambda: refresher
    with TestClient(app) as c:
        yield c


async def login(store: InMemorySessionStore, client: TestClient, t: SessionTokens) -> Session:
    cookie = new_session_token()
    session = await store.create(
        token_hash=hash_token(cookie), tenant_id=TENANT, subject="u1", csrf_token="csrf-1", tokens=t
    )
    client.cookies.set("hsp_session", cookie)
    return session


# --- settings and secrets -------------------------------------------------------------------


def test_production_requires_real_secrets() -> None:
    with pytest.raises(ValidationError, match="HSP_SESSION_ENCRYPTION_KEY"):
        Settings(environment="production")


def test_development_uses_dev_key_and_insecure_cookie_on_http() -> None:
    s = Settings(environment="development", public_url="http://localhost:5173")
    assert s.session_key() == DEV_SESSION_ENCRYPTION_KEY
    assert s.session_cookie_secure is False
    assert Settings(environment="test").session_cookie_secure is True


def test_cipher_round_trip_and_key_rotation() -> None:
    a = TokenCipher(DEV_SESSION_ENCRYPTION_KEY)
    secret = a.encrypt("refresh-token")
    assert "refresh-token" not in secret
    assert a.decrypt(secret) == "refresh-token"
    other = TokenCipher(base64.urlsafe_b64encode(b"x" * 32))
    with pytest.raises(TokenDecryptError):
        other.decrypt(secret)


def test_jwt_claims_and_roles() -> None:
    claims = jwt_claims(fake_jwt({"realm_access": {"roles": ["hsp-admin", 3]}}))
    assert realm_roles(claims) == {"hsp-admin"}
    assert realm_roles({}) == frozenset()
    with pytest.raises(ValueError):
        jwt_claims("not-a-jwt")


# --- principal resolution -------------------------------------------------------------------


def test_no_cookie_is_401_problem(client: TestClient) -> None:
    r = client.get("/_t/me")
    assert r.status_code == 401
    assert r.json()["type"].endswith("/not-authenticated")


async def test_valid_session_resolves_principal(
    store: InMemorySessionStore, client: TestClient
) -> None:
    await login(store, client, tokens(roles=["hsp-admin"]))
    r = client.get("/_t/me")
    assert r.status_code == 200
    assert r.json() == {"subject": "u1", "name": "Dev Admin", "admin": True}


async def test_expired_session_is_deleted(store: InMemorySessionStore, client: TestClient) -> None:
    await login(store, client, tokens(roles=[], session_in=timedelta(seconds=-1)))
    assert client.get("/_t/me").status_code == 401
    assert store.by_hash == {}


async def test_expiring_access_token_is_refreshed(
    store: InMemorySessionStore, client: TestClient, refresher: StubRefresher
) -> None:
    await login(store, client, tokens(roles=[], access_in=timedelta(seconds=5)))
    refresher.result = tokens(roles=["hsp-admin"])
    r = client.get("/_t/me")
    assert r.status_code == 200
    assert r.json()["admin"] is True  # roles come from the refreshed token
    assert refresher.calls == 1
    stored = next(iter(store.by_hash.values()))
    assert stored.tokens == refresher.result


async def test_refused_refresh_ends_session(
    store: InMemorySessionStore, client: TestClient, refresher: StubRefresher
) -> None:
    await login(store, client, tokens(roles=[], access_in=timedelta(seconds=5)))
    assert client.get("/_t/me").status_code == 401
    assert store.by_hash == {}


# --- authorization and CSRF -----------------------------------------------------------------


async def test_admin_with_csrf_may_edit(store: InMemorySessionStore, client: TestClient) -> None:
    await login(store, client, tokens(roles=["hsp-admin"]))
    assert client.post("/_t/edit", headers={"X-CSRF-Token": "csrf-1"}).status_code == 200


async def test_missing_or_wrong_csrf_is_403(
    store: InMemorySessionStore, client: TestClient
) -> None:
    await login(store, client, tokens(roles=["hsp-admin"]))
    for headers in ({}, {"X-CSRF-Token": "wrong"}):
        r = client.post("/_t/edit", headers=headers)
        assert r.status_code == 403
        assert r.json()["type"].endswith("/csrf-failed")


async def test_viewer_may_not_edit(store: InMemorySessionStore, client: TestClient) -> None:
    await login(store, client, tokens(roles=["default-roles-hsp"]))
    r = client.post("/_t/edit", headers={"X-CSRF-Token": "csrf-1"})
    assert r.status_code == 403
    assert r.json()["type"].endswith("/forbidden")
