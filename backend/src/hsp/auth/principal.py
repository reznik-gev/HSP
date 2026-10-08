"""The authenticated user of a request (docs/0027, docs/0077)."""

import base64
import json
import uuid
from dataclasses import dataclass
from typing import Any

ADMIN_ROLE = "hsp-admin"


@dataclass(frozen=True)
class Principal:
    subject: str
    name: str | None
    email: str | None
    roles: frozenset[str]
    tenant_id: uuid.UUID
    session_id: uuid.UUID
    csrf_token: str

    @property
    def is_admin(self) -> bool:
        """v1: admins may edit everything; everyone else is read-only (docs/0027)."""
        return ADMIN_ROLE in self.roles


def jwt_claims(token: str) -> dict[str, Any]:
    """Read a JWT's payload WITHOUT verifying its signature.

    Only used for access tokens HSP received directly from the identity provider's token
    endpoint over the back channel; ID tokens are signature-checked by the OIDC client.
    """
    try:
        payload = token.split(".")[1]
        padded = payload + "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(padded))
    except (IndexError, ValueError) as exc:
        raise ValueError("not a JWT") from exc
    if not isinstance(claims, dict):
        raise ValueError("JWT payload is not an object")
    return claims


def realm_roles(claims: dict[str, Any]) -> frozenset[str]:
    """Keycloak puts realm roles in `realm_access.roles`."""
    access = claims.get("realm_access")
    roles = access.get("roles") if isinstance(access, dict) else None
    return (
        frozenset(r for r in roles if isinstance(r, str))
        if isinstance(roles, list)
        else frozenset()
    )
