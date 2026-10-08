"""Server-side session storage (docs/0038, docs/0077).

`SessionStore` is the interface services depend on; `SqlSessionStore` is the PostgreSQL
implementation. Unit tests use an in-memory fake (docs/0061).
"""

import uuid
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Protocol

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.auth.tokens import TokenCipher, TokenDecryptError
from hsp.models import UserSession, new_id


@dataclass(frozen=True)
class SessionTokens:
    access_token: str
    access_expires_at: datetime
    refresh_token: str | None
    id_token: str | None
    #: End of the session: the refresh token's expiry, as decided by Keycloak (docs/0077).
    expires_at: datetime


@dataclass(frozen=True)
class Session:
    id: uuid.UUID
    tenant_id: uuid.UUID
    subject: str
    csrf_token: str
    tokens: SessionTokens


class SessionStore(Protocol):
    async def create(
        self,
        *,
        token_hash: str,
        tenant_id: uuid.UUID,
        subject: str,
        csrf_token: str,
        tokens: SessionTokens,
    ) -> Session: ...

    async def get(self, token_hash: str) -> Session | None: ...

    async def update_tokens(self, session_id: uuid.UUID, tokens: SessionTokens) -> None: ...

    async def delete(self, session_id: uuid.UUID) -> None: ...


class SqlSessionStore:
    """Token columns are encrypted; the cookie token is stored only as a SHA-256 hash."""

    def __init__(self, db: AsyncSession, cipher: TokenCipher) -> None:
        self._db = db
        self._cipher = cipher

    def _enc(self, value: str | None) -> str | None:
        return None if value is None else self._cipher.encrypt(value)

    def _dec(self, value: str | None) -> str | None:
        return None if value is None else self._cipher.decrypt(value)

    async def create(
        self,
        *,
        token_hash: str,
        tenant_id: uuid.UUID,
        subject: str,
        csrf_token: str,
        tokens: SessionTokens,
    ) -> Session:
        # Use a local id: after commit() the ORM object may be expired, and touching its
        # attributes would trigger a lazy load outside the async context.
        session_id = new_id()
        row = UserSession(
            id=session_id,
            tenant_id=tenant_id,
            token_hash=token_hash,
            subject=subject,
            csrf_token=csrf_token,
            access_token=self._cipher.encrypt(tokens.access_token),
            refresh_token=self._enc(tokens.refresh_token),
            id_token=self._enc(tokens.id_token),
            access_expires_at=tokens.access_expires_at,
            expires_at=tokens.expires_at,
        )
        self._db.add(row)
        await self._db.commit()
        return Session(session_id, tenant_id, subject, csrf_token, tokens)

    async def get(self, token_hash: str) -> Session | None:
        row = await self._db.scalar(select(UserSession).where(UserSession.token_hash == token_hash))
        if row is None:
            return None
        try:
            tokens = SessionTokens(
                access_token=self._cipher.decrypt(row.access_token),
                access_expires_at=row.access_expires_at,
                refresh_token=self._dec(row.refresh_token),
                id_token=self._dec(row.id_token),
                expires_at=row.expires_at,
            )
        except TokenDecryptError:
            # Encryption key rotated: the session is unusable (docs/0077).
            await self.delete(row.id)
            return None
        return Session(row.id, row.tenant_id, row.subject, row.csrf_token, tokens)

    async def update_tokens(self, session_id: uuid.UUID, tokens: SessionTokens) -> None:
        row = await self._db.get(UserSession, session_id)
        if row is None:
            return
        row.access_token = self._cipher.encrypt(tokens.access_token)
        row.refresh_token = self._enc(tokens.refresh_token)
        row.id_token = self._enc(tokens.id_token)
        row.access_expires_at = tokens.access_expires_at
        row.expires_at = tokens.expires_at
        await self._db.commit()

    async def delete(self, session_id: uuid.UUID) -> None:
        await self._db.execute(delete(UserSession).where(UserSession.id == session_id))
        await self._db.commit()


def with_tokens(session: Session, tokens: SessionTokens) -> Session:
    return replace(session, tokens=tokens)
