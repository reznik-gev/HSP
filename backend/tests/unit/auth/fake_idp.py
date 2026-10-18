"""A fake identity provider for the login tests, and the login steps that drive it (docs/0077:
mocked IdP only).

The fake is plugged in as an httpx2.MockTransport (no global patching). It signs real RS256 ID
tokens and checks PKCE, so the tests exercise the actual validation paths: state, nonce,
signature, PKCE verifier, refresh and logout.
"""

import base64
import hashlib
import time
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx2
from fastapi.testclient import TestClient
from joserfc import jwt
from joserfc.jwk import KeySet, RSAKey

from tests.fakes import InMemorySessionStore

ISSUER = "http://idp.test/realms/hsp"
OIDC = f"{ISSUER}/protocol/openid-connect"
PUBLIC = "http://app.test"


def new_signing_key(kid: str) -> RSAKey:
    return RSAKey.generate_key(2048, parameters={"kid": kid, "alg": "RS256", "use": "sig"})


class FakeIdP:
    def __init__(self) -> None:
        self.key = new_signing_key("k1")
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


def start_login(api: TestClient, next_path: str = "/floors") -> str:
    """Start a login; returns the provider URL the browser is sent to."""
    r = api.get("/api/v1/auth/login", params={"next": next_path})
    assert r.status_code == 302
    return r.headers["location"]


def full_login(api: TestClient, idp: FakeIdP, next_path: str = "/floors") -> httpx2.Response:
    """Log in all the way: start, get a code from the provider, and call back with it."""
    code, state = idp.issue_code(start_login(api, next_path))
    return api.get("/api/v1/auth/callback", params={"code": code, "state": state})


def expire_access_tokens(store: InMemorySessionStore) -> None:
    for h, s in store.by_hash.items():
        store.by_hash[h] = replace(
            s, tokens=replace(s.tokens, access_expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
