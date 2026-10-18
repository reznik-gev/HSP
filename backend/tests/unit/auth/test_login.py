"""BFF login against a fake identity provider: redirect, callback and the checks on what comes
back (docs/0077)."""

import json
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from hsp.main import create_app
from tests.fakes import InMemorySessionStore
from tests.unit.auth.fake_idp import (
    OIDC,
    PUBLIC,
    FakeIdP,
    full_login,
    new_signing_key,
    start_login,
)

#: A key an attacker made, with the same key id as the provider's.
ATTACKER_KEY = new_signing_key("k1")
#: The provider's next key, after it rotates.
ROTATED_KEY = new_signing_key("k2")


def test_login_redirects_with_pkce_state_and_nonce(api_with_fake_idp: TestClient) -> None:
    url = urlparse(start_login(api_with_fake_idp))
    q = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert f"{url.scheme}://{url.netloc}{url.path}" == f"{OIDC}/auth"
    assert q["client_id"] == "hsp-api"
    assert q["response_type"] == "code"
    assert q["redirect_uri"] == f"{PUBLIC}/api/v1/auth/callback"
    assert q["code_challenge_method"] == "S256"
    assert q["scope"] == "openid profile email"
    assert q["state"] and q["nonce"] and q["code_challenge"]
    assert api_with_fake_idp.cookies.get("hsp_login")  # encrypted state/nonce/verifier


def test_full_login_creates_session_and_me_works(
    api_with_fake_idp: TestClient, idp: FakeIdP, session_store: InMemorySessionStore
) -> None:
    r = full_login(api_with_fake_idp, idp)
    assert r.status_code == 302
    assert r.headers["location"] == f"{PUBLIC}/floors"
    assert "HttpOnly" in r.headers["set-cookie"]
    assert len(session_store.by_hash) == 1

    me = api_with_fake_idp.get("/api/v1/auth/me").json()
    assert me["subject"] == "user-1"
    assert me["name"] == "Dev Admin"
    assert me["is_admin"] is True
    assert me["csrf_token"]


@pytest.mark.parametrize(
    "evil", ["//evil.example/x", "https://evil.example", "/\\evil.example", "x"]
)
def test_next_cannot_redirect_off_site(
    api_with_fake_idp: TestClient, idp: FakeIdP, evil: str
) -> None:
    assert full_login(api_with_fake_idp, idp, evil).headers["location"] == f"{PUBLIC}/"


def test_state_mismatch_is_rejected(api_with_fake_idp: TestClient, idp: FakeIdP) -> None:
    code, _ = idp.issue_code(start_login(api_with_fake_idp))
    r = api_with_fake_idp.get("/api/v1/auth/callback", params={"code": code, "state": "forged"})
    assert r.status_code == 400
    assert r.json()["type"].endswith("/login-state-mismatch")


def test_callback_without_login_cookie_is_rejected(api_with_fake_idp: TestClient) -> None:
    r = api_with_fake_idp.get("/api/v1/auth/callback", params={"code": "c", "state": "s"})
    assert r.status_code == 400
    assert r.json()["type"].endswith("/login-expired")


def test_provider_error_is_reported(api_with_fake_idp: TestClient) -> None:
    start_login(api_with_fake_idp)
    r = api_with_fake_idp.get(
        "/api/v1/auth/callback",
        params={"error": "access_denied", "error_description": "User cancelled", "state": "x"},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "User cancelled"


def test_wrong_pkce_verifier_fails_token_exchange(
    api_with_fake_idp: TestClient, idp: FakeIdP
) -> None:
    code, state = idp.issue_code(start_login(api_with_fake_idp))
    idp.codes[code]["challenge"] = "something-else"
    r = api_with_fake_idp.get("/api/v1/auth/callback", params={"code": code, "state": state})
    assert r.status_code == 400
    assert r.json()["type"].endswith("/login-invalid")


def test_id_token_with_wrong_nonce_is_rejected(
    api_with_fake_idp: TestClient, idp: FakeIdP, session_store: InMemorySessionStore
) -> None:
    idp.id_token_nonce_override = "replayed-nonce"
    r = full_login(api_with_fake_idp, idp)
    assert r.status_code == 400
    assert "invalid ID token" in r.json()["detail"]
    assert session_store.by_hash == {}


def test_id_token_signed_by_unknown_key_is_rejected(
    api_with_fake_idp: TestClient, idp: FakeIdP
) -> None:
    code, state = idp.issue_code(start_login(api_with_fake_idp))
    idp.key = ATTACKER_KEY  # the provider's JWKS still publishes only its real key
    r = api_with_fake_idp.get("/api/v1/auth/callback", params={"code": code, "state": state})
    assert r.status_code == 400
    assert r.json()["type"].endswith("/login-invalid")


def test_rotated_signing_key_is_picked_up(api_with_fake_idp: TestClient, idp: FakeIdP) -> None:
    full_login(api_with_fake_idp, idp)  # caches the JWKS with key k1
    idp.key = ROTATED_KEY
    idp.published_keys = [ROTATED_KEY]  # the provider rotated its key
    api_with_fake_idp.cookies.clear()
    assert full_login(api_with_fake_idp, idp).status_code == 302


def test_me_payload_shape_is_stable() -> None:
    """The OpenAPI schema exposes the Me model the frontend client is generated from."""
    schema = create_app().openapi()
    me = schema["components"]["schemas"]["Me"]["properties"]
    assert set(me) == {"subject", "name", "email", "roles", "is_admin", "csrf_token"}
    assert json.dumps(schema)  # serializable
