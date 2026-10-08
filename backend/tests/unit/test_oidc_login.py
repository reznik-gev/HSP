"""BFF login against a mocked identity provider (docs/0077: mocked IdP only).

The fake IdP is plugged in as an httpx2.MockTransport (no global patching).

The fake IdP signs real RS256 ID tokens and checks PKCE, so these tests exercise the actual
validation paths: state, nonce, signature, PKCE verifier, refresh and logout.
"""

import base64
import hashlib
import json
import time
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx2
import pytest
from fastapi.testclient import TestClient
from joserfc import jwt
from joserfc.jwk import KeySet, RSAKey

from hsp.auth.dependencies import get_session_store
from hsp.auth.oidc import OidcClient
from hsp.config import Settings, get_settings
from hsp.main import create_app
from hsp.models import new_id
from hsp.tenancy import get_tenant_id
from tests.fakes import InMemorySessionStore

ISSUER = "http://idp.test/realms/hsp"
OIDC = f"{ISSUER}/protocol/openid-connect"
PUBLIC = "http://app.test"
TENANT = new_id()


class FakeIdP:
    def __init__(self) -> None:
        self.key = RSAKey.generate_key(2048, parameters={"kid": "k1", "alg": "RS256", "use": "sig"})
        self.codes: dict[str, dict[str, str]] = {}
        self.refresh_tokens: set[str] = set()
        self.revoked: list[str] = []
        self.issued = 0
        self.id_token_nonce_override: str | None = None
        self.roles = ["hsp-admin"]
        self.published_keys: list[RSAKey] = [self.key]

    def handle(self, request: httpx2.Request) -> httpx2.Response:
        url = str(request.url).split("?")[0]
        if url == f"{ISSUER}/.well-known/openid-configuration":
            return httpx2.Response(
                200,
                json={
                    "issuer": ISSUER,
                    "authorization_endpoint": f"{OIDC}/auth",
                    "token_endpoint": f"{OIDC}/token",
                    "jwks_uri": f"{OIDC}/certs",
                    "end_session_endpoint": f"{OIDC}/logout",
                    "revocation_endpoint": f"{OIDC}/revoke",
                },
            )
        if url == f"{OIDC}/certs":
            return httpx2.Response(200, json=KeySet(self.published_keys).as_dict(private=False))
        if url == f"{OIDC}/token":
            return self.token_endpoint(request)
        if url == f"{OIDC}/revoke":
            return self.revoke_endpoint(request)
        return httpx2.Response(404)

    def issue_code(self, auth_url: str) -> tuple[str, str]:
        q = {k: v[0] for k, v in parse_qs(urlparse(auth_url).query).items()}
        code = f"code-{len(self.codes)}"
        self.codes[code] = {"nonce": q["nonce"], "challenge": q["code_challenge"]}
        return code, q["state"]

    def _jwt(self, claims: dict[str, Any], key: RSAKey | None = None) -> str:
        signer = key or self.key
        return jwt.encode({"alg": "RS256", "kid": signer.kid}, claims, signer)

    def _tokens(self, nonce: str | None) -> dict[str, Any]:
        now = int(time.time())
        self.issued += 1
        refresh = f"refresh-{self.issued}"
        self.refresh_tokens.add(refresh)
        access = self._jwt(
            {
                "sub": "user-1",
                "name": "Dev Admin",
                "email": "admin@hsp.local",
                "exp": now + 300,
                "realm_access": {"roles": self.roles},
            }
        )
        body: dict[str, Any] = {
            "access_token": access,
            "expires_in": 300,
            "refresh_token": refresh,
            "refresh_expires_in": 1800,
            "token_type": "Bearer",
        }
        if nonce is not None:
            body["id_token"] = self._jwt(
                {
                    "iss": ISSUER,
                    "aud": "hsp-api",
                    "sub": "user-1",
                    "iat": now,
                    "exp": now + 300,
                    "nonce": self.id_token_nonce_override or nonce,
                }
            )
        return body

    def token_endpoint(self, request: httpx2.Request) -> httpx2.Response:
        assert request.headers["authorization"].startswith("Basic ")  # client_secret_basic
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        if form["grant_type"] == "authorization_code":
            saved = self.codes.pop(form["code"], None)
            verifier = form.get("code_verifier", "")
            challenge = (
                base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
                .rstrip(b"=")
                .decode()
            )
            if saved is None or challenge != saved["challenge"]:
                return httpx2.Response(400, json={"error": "invalid_grant"})
            return httpx2.Response(200, json=self._tokens(saved["nonce"]))
        if form["grant_type"] == "refresh_token":
            if form["refresh_token"] not in self.refresh_tokens:
                return httpx2.Response(400, json={"error": "invalid_grant"})
            self.refresh_tokens.discard(form["refresh_token"])
            return httpx2.Response(200, json=self._tokens(None))
        return httpx2.Response(400, json={"error": "unsupported_grant_type"})

    def revoke_endpoint(self, request: httpx2.Request) -> httpx2.Response:
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        self.revoked.append(form["token"])
        self.refresh_tokens.discard(form["token"])
        return httpx2.Response(200)


@pytest.fixture
def idp() -> FakeIdP:
    return FakeIdP()


@pytest.fixture
def store() -> InMemorySessionStore:
    return InMemorySessionStore()


@pytest.fixture
def client(idp: FakeIdP, store: InMemorySessionStore) -> Iterator[TestClient]:
    settings = Settings(environment="development", public_url=PUBLIC, oidc_issuer_url=ISSUER)
    app = create_app()
    app.state.oidc = OidcClient(settings, transport=httpx2.MockTransport(idp.handle))
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_session_store] = lambda: store
    app.dependency_overrides[get_tenant_id] = lambda: TENANT
    with TestClient(app, follow_redirects=False) as c:
        yield c


def start_login(client: TestClient, next_path: str = "/floors") -> str:
    r = client.get("/api/v1/auth/login", params={"next": next_path})
    assert r.status_code == 302
    return r.headers["location"]


def full_login(client: TestClient, idp: FakeIdP, next_path: str = "/floors") -> httpx2.Response:
    code, state = idp.issue_code(start_login(client, next_path))
    return client.get("/api/v1/auth/callback", params={"code": code, "state": state})


# --- login --------------------------------------------------------------------------------


def test_login_redirects_with_pkce_state_and_nonce(client: TestClient) -> None:
    url = urlparse(start_login(client))
    q = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert f"{url.scheme}://{url.netloc}{url.path}" == f"{OIDC}/auth"
    assert q["client_id"] == "hsp-api"
    assert q["response_type"] == "code"
    assert q["redirect_uri"] == f"{PUBLIC}/api/v1/auth/callback"
    assert q["code_challenge_method"] == "S256"
    assert q["scope"] == "openid profile email"
    assert q["state"] and q["nonce"] and q["code_challenge"]
    assert client.cookies.get("hsp_login")  # encrypted state/nonce/verifier


def test_full_login_creates_session_and_me_works(
    client: TestClient, idp: FakeIdP, store: InMemorySessionStore
) -> None:
    r = full_login(client, idp)
    assert r.status_code == 302
    assert r.headers["location"] == f"{PUBLIC}/floors"
    assert "HttpOnly" in r.headers["set-cookie"]
    assert len(store.by_hash) == 1

    me = client.get("/api/v1/auth/me").json()
    assert me["subject"] == "user-1"
    assert me["name"] == "Dev Admin"
    assert me["is_admin"] is True
    assert me["csrf_token"]


@pytest.mark.parametrize(
    "evil", ["//evil.example/x", "https://evil.example", "/\\evil.example", "x"]
)
def test_next_cannot_redirect_off_site(client: TestClient, idp: FakeIdP, evil: str) -> None:
    assert full_login(client, idp, evil).headers["location"] == f"{PUBLIC}/"


def test_state_mismatch_is_rejected(client: TestClient, idp: FakeIdP) -> None:
    code, _ = idp.issue_code(start_login(client))
    r = client.get("/api/v1/auth/callback", params={"code": code, "state": "forged"})
    assert r.status_code == 400
    assert r.json()["type"].endswith("/login-state-mismatch")


def test_callback_without_login_cookie_is_rejected(client: TestClient) -> None:
    r = client.get("/api/v1/auth/callback", params={"code": "c", "state": "s"})
    assert r.status_code == 400
    assert r.json()["type"].endswith("/login-expired")


def test_provider_error_is_reported(client: TestClient) -> None:
    start_login(client)
    r = client.get(
        "/api/v1/auth/callback",
        params={"error": "access_denied", "error_description": "User cancelled", "state": "x"},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "User cancelled"


def test_wrong_pkce_verifier_fails_token_exchange(client: TestClient, idp: FakeIdP) -> None:
    code, state = idp.issue_code(start_login(client))
    idp.codes[code]["challenge"] = "something-else"
    r = client.get("/api/v1/auth/callback", params={"code": code, "state": state})
    assert r.status_code == 400
    assert r.json()["type"].endswith("/login-invalid")


def test_id_token_with_wrong_nonce_is_rejected(
    client: TestClient, idp: FakeIdP, store: InMemorySessionStore
) -> None:
    idp.id_token_nonce_override = "replayed-nonce"
    r = full_login(client, idp)
    assert r.status_code == 400
    assert "invalid ID token" in r.json()["detail"]
    assert store.by_hash == {}


def test_id_token_signed_by_unknown_key_is_rejected(client: TestClient, idp: FakeIdP) -> None:
    code, state = idp.issue_code(start_login(client))
    # An attacker signs with their own key under the same kid; JWKS still publishes the real one.
    idp.key = RSAKey.generate_key(2048, parameters={"kid": "k1", "alg": "RS256"})
    r = client.get("/api/v1/auth/callback", params={"code": code, "state": state})
    assert r.status_code == 400
    assert r.json()["type"].endswith("/login-invalid")


def test_rotated_signing_key_is_picked_up(client: TestClient, idp: FakeIdP) -> None:
    full_login(client, idp)  # caches the JWKS with key k1
    new_key = RSAKey.generate_key(2048, parameters={"kid": "k2", "alg": "RS256"})
    idp.key = new_key
    idp.published_keys = [new_key]  # the provider rotated its key
    client.cookies.clear()
    r = full_login(client, idp)
    assert r.status_code == 302


# --- refresh and logout -------------------------------------------------------------------


def _expire_access_token(store: InMemorySessionStore) -> None:
    from dataclasses import replace

    for h, s in store.by_hash.items():
        store.by_hash[h] = replace(
            s, tokens=replace(s.tokens, access_expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )


def test_expired_access_token_is_refreshed(
    client: TestClient, idp: FakeIdP, store: InMemorySessionStore
) -> None:
    full_login(client, idp)
    old = next(iter(store.by_hash.values())).tokens
    _expire_access_token(store)
    assert client.get("/api/v1/auth/me").status_code == 200
    new = next(iter(store.by_hash.values())).tokens
    # Proof of a real refresh: a rotated refresh token and a fresh access-token expiry.
    # (Access tokens can be byte-identical: same claims within one second, RS256 deterministic.)
    assert new.refresh_token != old.refresh_token
    assert new.access_expires_at > datetime.now(UTC)
    assert new.id_token == old.id_token  # kept: refresh responses carry no ID token


def test_revoked_refresh_token_ends_session(
    client: TestClient, idp: FakeIdP, store: InMemorySessionStore
) -> None:
    full_login(client, idp)
    idp.refresh_tokens.clear()  # e.g. Keycloak SSO idle timeout or admin revoke
    _expire_access_token(store)
    assert client.get("/api/v1/auth/me").status_code == 401
    assert store.by_hash == {}


def test_logout_requires_csrf(client: TestClient, idp: FakeIdP) -> None:
    full_login(client, idp)
    assert client.post("/api/v1/auth/logout").status_code == 403


def test_logout_revokes_and_returns_provider_logout_url(
    client: TestClient, idp: FakeIdP, store: InMemorySessionStore
) -> None:
    full_login(client, idp)
    csrf = client.get("/api/v1/auth/me").json()["csrf_token"]
    refresh = next(iter(store.by_hash.values())).tokens.refresh_token

    r = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    url = urlparse(r.json()["logout_url"])
    q = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert f"{url.scheme}://{url.netloc}{url.path}" == f"{OIDC}/logout"
    assert q["post_logout_redirect_uri"] == f"{PUBLIC}/"
    assert q["id_token_hint"]
    assert idp.revoked == [refresh]
    assert store.by_hash == {}
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_payload_shape_is_stable() -> None:
    """The OpenAPI schema exposes the Me model the frontend client is generated from."""
    schema = create_app().openapi()
    me = schema["components"]["schemas"]["Me"]["properties"]
    assert set(me) == {"subject", "name", "email", "roles", "is_admin", "csrf_token"}
    assert json.dumps(schema)  # serializable
