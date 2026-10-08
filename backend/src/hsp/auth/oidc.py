"""OpenID Connect client for the backend-for-frontend login (docs/0038, docs/0077).

Authlib drives the OAuth 2.0 protocol over httpx2 (the successor of httpx, which Authlib
now prefers): authorization URL with PKCE S256, code exchange and refresh.
joserfc validates ID tokens against the provider's JWKS. HSP speaks plain OIDC: nothing here is
Keycloak-specific except reading Keycloak's optional `refresh_expires_in` (docs/0008).
"""

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx2
from authlib.integrations.base_client.errors import OAuthError
from authlib.integrations.httpx_client import AsyncOAuth2Client
from joserfc import jwt
from joserfc.errors import JoseError
from joserfc.jwk import KeySet

from hsp.auth.sessions import Session, SessionTokens, with_tokens
from hsp.config import Settings


class OidcError(Exception):
    """The provider rejected the login, or returned something we can't trust."""


@dataclass(frozen=True)
class ProviderMetadata:
    issuer: str
    authorization_endpoint: str
    token_endpoint: str
    jwks_uri: str
    end_session_endpoint: str | None
    revocation_endpoint: str | None


@dataclass(frozen=True)
class LoginRequest:
    url: str
    state: str
    nonce: str
    code_verifier: str


@dataclass(frozen=True)
class LoginResult:
    subject: str
    tokens: SessionTokens


def tokens_from_response(
    token: dict[str, Any], previous: SessionTokens | None = None
) -> SessionTokens:
    """Map a token-endpoint response to session tokens.

    The session ends when the refresh token does (Keycloak's `refresh_expires_in`), so login
    policy lives in the identity provider (docs/0077).
    """
    now = datetime.now(UTC)
    access_in = int(token.get("expires_in") or 60)
    refresh_in = int(token.get("refresh_expires_in") or 0)
    refresh_token = token.get("refresh_token") or (previous.refresh_token if previous else None)
    return SessionTokens(
        access_token=str(token["access_token"]),
        access_expires_at=now + timedelta(seconds=access_in),
        refresh_token=refresh_token,
        id_token=token.get("id_token") or (previous.id_token if previous else None),
        expires_at=now + timedelta(seconds=refresh_in if refresh_in > 0 else access_in),
    )


class OidcClient:
    """One instance per app; caches provider metadata and keys."""

    def __init__(
        self, settings: Settings, transport: httpx2.AsyncBaseTransport | None = None
    ) -> None:
        """`transport` lets tests substitute a fake identity provider (httpx2.MockTransport)."""
        self._settings = settings
        self._transport = transport
        self._metadata: ProviderMetadata | None = None
        self._jwks: KeySet | None = None

    def _oauth(self, **kwargs: Any) -> AsyncOAuth2Client:
        s = self._settings
        return AsyncOAuth2Client(
            client_id=s.oidc_client_id,
            client_secret=s.oidc_client_secret.get_secret_value(),
            scope=s.oidc_scopes,
            redirect_uri=s.oidc_redirect_uri,
            code_challenge_method="S256",
            token_endpoint_auth_method="client_secret_basic",
            transport=self._transport,
            **kwargs,
        )

    async def metadata(self) -> ProviderMetadata:
        if self._metadata is None:
            issuer = self._settings.oidc_issuer_url.rstrip("/")
            async with httpx2.AsyncClient(transport=self._transport) as http:
                r = await http.get(f"{issuer}/.well-known/openid-configuration", timeout=10)
                r.raise_for_status()
                d = r.json()
            self._metadata = ProviderMetadata(
                issuer=d["issuer"],
                authorization_endpoint=d["authorization_endpoint"],
                token_endpoint=d["token_endpoint"],
                jwks_uri=d["jwks_uri"],
                end_session_endpoint=d.get("end_session_endpoint"),
                revocation_endpoint=d.get("revocation_endpoint"),
            )
        return self._metadata

    async def _key_set(self, refresh: bool = False) -> KeySet:
        if self._jwks is None or refresh:
            meta = await self.metadata()
            async with httpx2.AsyncClient(transport=self._transport) as http:
                r = await http.get(meta.jwks_uri, timeout=10)
                r.raise_for_status()
                self._jwks = KeySet.import_key_set(r.json())
        return self._jwks

    async def begin_login(self) -> LoginRequest:
        meta = await self.metadata()
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        verifier = secrets.token_urlsafe(64)
        async with self._oauth() as client:
            url, _ = client.create_authorization_url(
                meta.authorization_endpoint, state=state, code_verifier=verifier, nonce=nonce
            )
        return LoginRequest(url=url, state=state, nonce=nonce, code_verifier=verifier)

    async def complete_login(self, *, code: str, code_verifier: str, nonce: str) -> LoginResult:
        meta = await self.metadata()
        try:
            async with self._oauth() as client:
                token = await client.fetch_token(
                    meta.token_endpoint, code=code, code_verifier=code_verifier
                )
        except OAuthError as exc:
            raise OidcError(f"token exchange failed: {exc.error}") from exc
        id_token = token.get("id_token")
        if not isinstance(id_token, str):
            raise OidcError("provider returned no ID token")
        claims = await self.validate_id_token(id_token, nonce=nonce)
        return LoginResult(subject=str(claims["sub"]), tokens=tokens_from_response(dict(token)))

    async def validate_id_token(self, id_token: str, *, nonce: str) -> dict[str, Any]:
        meta = await self.metadata()
        registry = jwt.JWTClaimsRegistry(
            leeway=self._settings.oidc_leeway_s,
            iss={"essential": True, "value": meta.issuer},
            aud={"essential": True, "value": self._settings.oidc_client_id},
            sub={"essential": True},
            exp={"essential": True},
            nonce={"essential": True, "value": nonce},
        )
        try:
            return self._decode(id_token, await self._key_set(), registry)
        except (JoseError, ValueError):
            # The provider may have rotated its signing key: refetch the key set once.
            try:
                return self._decode(id_token, await self._key_set(refresh=True), registry)
            except (JoseError, ValueError) as exc:
                raise OidcError(f"invalid ID token: {exc}") from exc

    @staticmethod
    def _decode(id_token: str, keys: KeySet, registry: jwt.JWTClaimsRegistry) -> dict[str, Any]:
        token = jwt.decode(id_token, keys, algorithms=["RS256", "ES256"])
        registry.validate(token.claims)
        return dict(token.claims)

    async def refresh(self, session: Session) -> Session | None:
        """TokenRefresher (docs/0077): new tokens, or None when the provider ended the session."""
        if not session.tokens.refresh_token:
            return None
        meta = await self.metadata()
        try:
            async with self._oauth() as client:
                token = await client.refresh_token(
                    meta.token_endpoint, refresh_token=session.tokens.refresh_token
                )
        except OAuthError:
            return None
        return with_tokens(session, tokens_from_response(dict(token), previous=session.tokens))

    async def end_session(self, tokens: SessionTokens) -> str | None:
        """Revoke the refresh token (best effort) and return the provider's logout URL."""
        meta = await self.metadata()
        if meta.revocation_endpoint and tokens.refresh_token:
            try:
                async with self._oauth() as client:
                    await client.revoke_token(
                        meta.revocation_endpoint,
                        token=tokens.refresh_token,
                        token_type_hint="refresh_token",
                    )
            except (OAuthError, httpx2.HTTPError):
                pass  # the session is deleted locally either way
        if not meta.end_session_endpoint:
            return None
        params = {
            "client_id": self._settings.oidc_client_id,
            "post_logout_redirect_uri": f"{self._settings.public_url.rstrip('/')}/",
        }
        if tokens.id_token:
            params["id_token_hint"] = tokens.id_token
        return f"{meta.end_session_endpoint}?{urlencode(params)}"
