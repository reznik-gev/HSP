"""Backend-for-frontend login endpoints (docs/0038, docs/0077).

Browser flow: GET /auth/login -> identity provider -> GET /auth/callback -> app. Tokens stay on
the server; the browser only ever holds the opaque `hsp_session` cookie.
"""

import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from hsp.auth.dependencies import CurrentPrincipal, get_session_store, require_csrf
from hsp.auth.oidc import OidcClient, OidcError
from hsp.auth.sessions import SessionStore
from hsp.auth.tokens import (
    TokenCipher,
    TokenDecryptError,
    constant_time_equals,
    hash_token,
    new_csrf_token,
    new_session_token,
)
from hsp.config import Settings, get_settings
from hsp.problems import ProblemException
from hsp.tenancy import get_tenant_id

router = APIRouter(prefix="/auth", tags=["auth"])

SettingsDep = Annotated[Settings, Depends(get_settings)]
StoreDep = Annotated[SessionStore, Depends(get_session_store)]


def get_oidc_client(request: Request) -> OidcClient:
    client: OidcClient = request.app.state.oidc
    return client


OidcDep = Annotated[OidcClient, Depends(get_oidc_client)]


class Me(BaseModel):
    subject: str
    name: str | None
    email: str | None
    roles: list[str]
    is_admin: bool
    #: Send as `X-CSRF-Token` on every state-changing request (docs/0038).
    csrf_token: str


class LogoutResult(BaseModel):
    #: Visit this URL to also end the identity-provider session (null if it has none).
    logout_url: str | None


def safe_next(next_path: str | None) -> str:
    """Only same-origin relative paths: blocks open redirects such as //evil.example."""
    if not next_path or not next_path.startswith("/") or next_path.startswith("//"):
        return "/"
    if "\\" in next_path or "://" in next_path:
        return "/"
    return next_path


def _login_failed(slug: str, detail: str) -> ProblemException:
    return ProblemException(400, slug, "Login failed", detail)


@router.get("/login", response_class=RedirectResponse, status_code=302)
async def login(
    settings: SettingsDep,
    oidc: OidcDep,
    next: Annotated[str | None, Query(description="Relative path to return to")] = None,
) -> RedirectResponse:
    """Start the login: redirect to the identity provider."""
    req = await oidc.begin_login()
    cipher = TokenCipher(settings.session_key())
    state = json.dumps(
        {
            "state": req.state,
            "nonce": req.nonce,
            "verifier": req.code_verifier,
            "next": safe_next(next),
        }
    )
    response = RedirectResponse(req.url, status_code=302)
    response.set_cookie(
        settings.login_cookie_name,
        cipher.encrypt(state),
        max_age=settings.login_max_age_s,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/api/v1/auth",
    )
    return response


@router.get("/callback", response_class=RedirectResponse, status_code=302)
async def callback(
    request: Request,
    settings: SettingsDep,
    oidc: OidcDep,
    store: StoreDep,
    tenant_id: Annotated[uuid.UUID, Depends(get_tenant_id)],
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
) -> RedirectResponse:
    """Finish the login: exchange the code, create the session, set the cookie."""
    raw = request.cookies.get(settings.login_cookie_name)
    if not raw:
        raise _login_failed(
            "login-expired", "Login took too long or cookies are blocked. Try again."
        )
    try:
        saved = json.loads(
            TokenCipher(settings.session_key()).decrypt(raw, ttl=settings.login_max_age_s)
        )
    except (TokenDecryptError, ValueError):
        raise _login_failed("login-expired", "Login took too long. Try again.") from None
    if error:
        raise _login_failed("login-denied", error_description or error)
    if not code or not state or not constant_time_equals(state, saved["state"]):
        raise _login_failed("login-state-mismatch", "Login response did not match the request.")

    try:
        result = await oidc.complete_login(
            code=code, code_verifier=saved["verifier"], nonce=saved["nonce"]
        )
    except OidcError as exc:
        raise _login_failed("login-invalid", str(exc)) from exc

    cookie = new_session_token()
    session = await store.create(
        token_hash=hash_token(cookie),
        tenant_id=tenant_id,
        subject=result.subject,
        csrf_token=new_csrf_token(),
        tokens=result.tokens,
    )
    lifetime = int((session.tokens.expires_at - session.tokens.access_expires_at).total_seconds())
    response = RedirectResponse(
        f"{settings.public_url.rstrip('/')}{saved['next']}", status_code=302
    )
    response.set_cookie(
        settings.session_cookie_name,
        cookie,
        max_age=max(lifetime, 60) + 60,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    response.delete_cookie(settings.login_cookie_name, path="/api/v1/auth")
    return response


@router.get("/me")
async def me(principal: CurrentPrincipal) -> Me:
    """Who is logged in, plus the CSRF token for state-changing requests."""
    return Me(
        subject=principal.subject,
        name=principal.name,
        email=principal.email,
        roles=sorted(principal.roles),
        is_admin=principal.is_admin,
        csrf_token=principal.csrf_token,
    )


@router.post("/logout", dependencies=[Depends(require_csrf)])
async def logout(
    principal: CurrentPrincipal,
    settings: SettingsDep,
    oidc: OidcDep,
    store: StoreDep,
    request: Request,
    response: Response,
) -> LogoutResult:
    """End the HSP session and return the identity provider's logout URL."""
    session = await store.get(hash_token(request.cookies.get(settings.session_cookie_name, "")))
    logout_url = await oidc.end_session(session.tokens) if session else None
    await store.delete(principal.session_id)
    response.delete_cookie(settings.session_cookie_name, path="/")
    return LogoutResult(logout_url=logout_url)
