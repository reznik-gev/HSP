"""Stub tokens for the auth tests: unsigned JWTs and the tokens a session holds."""

import base64
import json
from datetime import UTC, datetime, timedelta
from typing import Any

from hsp.auth.sessions import SessionTokens


def stub_jwt(claims: dict[str, Any]) -> str:
    """A JWT carrying `claims`, unsigned: for code that reads claims without checking them."""

    def b64(obj: dict[str, Any]) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()

    return f"{b64({'alg': 'none'})}.{b64(claims)}.sig"


def stub_tokens(
    *,
    roles: list[str],
    access_in: timedelta = timedelta(minutes=5),
    session_in: timedelta = timedelta(hours=1),
) -> SessionTokens:
    """The tokens of user u1 with realm `roles`, whose access token and session expire after
    `access_in` and `session_in`."""
    now = datetime.now(UTC)
    return SessionTokens(
        access_token=stub_jwt(
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
