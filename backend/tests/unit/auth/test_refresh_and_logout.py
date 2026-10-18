"""After login: refreshing the access token through the fake identity provider, and logging out
(docs/0077)."""

from datetime import UTC, datetime
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from tests.fakes import InMemorySessionStore
from tests.unit.auth.fake_idp import OIDC, PUBLIC, FakeIdP, expire_access_tokens, full_login


def test_expired_access_token_is_refreshed(
    api_with_fake_idp: TestClient, idp: FakeIdP, session_store: InMemorySessionStore
) -> None:
    full_login(api_with_fake_idp, idp)
    old = next(iter(session_store.by_hash.values())).tokens
    expire_access_tokens(session_store)
    assert api_with_fake_idp.get("/api/v1/auth/me").status_code == 200
    new = next(iter(session_store.by_hash.values())).tokens
    # Proof of a real refresh: a rotated refresh token and a fresh access-token expiry.
    # (Access tokens can be byte-identical: same claims within one second, RS256 deterministic.)
    assert new.refresh_token != old.refresh_token
    assert new.access_expires_at > datetime.now(UTC)
    assert new.id_token == old.id_token  # kept: refresh responses carry no ID token


def test_revoked_refresh_token_ends_session(
    api_with_fake_idp: TestClient, idp: FakeIdP, session_store: InMemorySessionStore
) -> None:
    full_login(api_with_fake_idp, idp)
    idp.refresh_tokens.clear()  # e.g. Keycloak SSO idle timeout or admin revoke
    expire_access_tokens(session_store)
    assert api_with_fake_idp.get("/api/v1/auth/me").status_code == 401
    assert session_store.by_hash == {}


def test_logout_requires_csrf(api_with_fake_idp: TestClient, idp: FakeIdP) -> None:
    full_login(api_with_fake_idp, idp)
    assert api_with_fake_idp.post("/api/v1/auth/logout").status_code == 403


def test_logout_revokes_and_returns_provider_logout_url(
    api_with_fake_idp: TestClient, idp: FakeIdP, session_store: InMemorySessionStore
) -> None:
    full_login(api_with_fake_idp, idp)
    csrf = api_with_fake_idp.get("/api/v1/auth/me").json()["csrf_token"]
    refresh = next(iter(session_store.by_hash.values())).tokens.refresh_token

    r = api_with_fake_idp.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    url = urlparse(r.json()["logout_url"])
    q = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert f"{url.scheme}://{url.netloc}{url.path}" == f"{OIDC}/logout"
    assert q["post_logout_redirect_uri"] == f"{PUBLIC}/"
    assert q["id_token_hint"]
    assert idp.revoked == [refresh]
    assert session_store.by_hash == {}
    assert api_with_fake_idp.get("/api/v1/auth/me").status_code == 401
