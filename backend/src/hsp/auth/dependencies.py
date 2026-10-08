"""FastAPI dependencies: who is calling, may they edit, and is the request CSRF-safe.

Use on routers, e.g.:
    @router.post("/sites", dependencies=[Depends(require_csrf), Depends(require_admin)])
"""

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Annotated, Protocol

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.auth.principal import Principal, jwt_claims, realm_roles
from hsp.auth.sessions import Session, SessionStore, SqlSessionStore, with_tokens
from hsp.auth.tokens import TokenCipher, constant_time_equals, hash_token
from hsp.config import Settings, get_settings
from hsp.db import get_session
from hsp.problems import ProblemException

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
CSRF_HEADER = "X-CSRF-Token"


class TokenRefresher(Protocol):
    """Exchanges a session's refresh token for new tokens; provided by the OIDC client."""

    async def refresh(self, session: Session) -> Session | None:
        """Return the session with new tokens, or None if the IdP refused (session over)."""
        ...


async def get_session_store(
    db: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AsyncIterator[SessionStore]:
    yield SqlSessionStore(db, TokenCipher(settings.session_key()))


async def get_token_refresher(request: Request) -> TokenRefresher | None:
    """The app's OIDC client refreshes tokens (docs/0077)."""
    refresher: TokenRefresher | None = getattr(request.app.state, "oidc", None)
    return refresher


def _unauthenticated(detail: str) -> ProblemException:
    return ProblemException(401, "not-authenticated", "Not authenticated", detail)


async def get_principal(
    request: Request,
    store: Annotated[SessionStore, Depends(get_session_store)],
    refresher: Annotated[TokenRefresher | None, Depends(get_token_refresher)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Principal:
    cookie = request.cookies.get(settings.session_cookie_name)
    if not cookie:
        raise _unauthenticated("No session. Log in via /api/v1/auth/login.")
    session = await store.get(hash_token(cookie))
    if session is None:
        raise _unauthenticated("Unknown or revoked session.")

    now = datetime.now(UTC)
    if session.tokens.expires_at <= now:
        await store.delete(session.id)
        raise _unauthenticated("Session expired.")

    margin = timedelta(seconds=settings.access_token_refresh_margin_s)
    if session.tokens.access_expires_at <= now + margin:
        refreshed = await refresher.refresh(session) if refresher else None
        if refreshed is None:
            await store.delete(session.id)
            raise _unauthenticated("Session expired.")
        await store.update_tokens(session.id, refreshed.tokens)
        session = with_tokens(session, refreshed.tokens)

    try:
        claims = jwt_claims(session.tokens.access_token)
    except ValueError:
        await store.delete(session.id)
        raise _unauthenticated("Session token is invalid.") from None

    name = claims.get("name") or claims.get("preferred_username")
    email = claims.get("email")
    return Principal(
        subject=session.subject,
        name=name if isinstance(name, str) else None,
        email=email if isinstance(email, str) else None,
        roles=realm_roles(claims),
        tenant_id=session.tenant_id,
        session_id=session.id,
        csrf_token=session.csrf_token,
    )


CurrentPrincipal = Annotated[Principal, Depends(get_principal)]


async def require_admin(principal: CurrentPrincipal) -> Principal:
    """v1: only admins may change anything (docs/0027)."""
    if not principal.is_admin:
        raise ProblemException(403, "forbidden", "Forbidden", "This action requires hsp-admin.")
    return principal


async def require_csrf(request: Request, principal: CurrentPrincipal) -> Principal:
    """State-changing requests must echo the session's CSRF token (docs/0038)."""
    if request.method not in SAFE_METHODS:
        sent = request.headers.get(CSRF_HEADER, "")
        if not sent or not constant_time_equals(sent, principal.csrf_token):
            raise ProblemException(
                403, "csrf-failed", "CSRF check failed", f"Send the {CSRF_HEADER} header."
            )
    return principal
