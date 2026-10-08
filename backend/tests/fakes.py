"""In-memory fakes of repository interfaces for unit tests (docs/0061)."""

import uuid

from hsp.auth.sessions import Session, SessionTokens, with_tokens
from hsp.models import new_id


class InMemorySessionStore:
    def __init__(self) -> None:
        self.by_hash: dict[str, Session] = {}

    async def create(
        self,
        *,
        token_hash: str,
        tenant_id: uuid.UUID,
        subject: str,
        csrf_token: str,
        tokens: SessionTokens,
    ) -> Session:
        session = Session(new_id(), tenant_id, subject, csrf_token, tokens)
        self.by_hash[token_hash] = session
        return session

    async def get(self, token_hash: str) -> Session | None:
        return self.by_hash.get(token_hash)

    async def update_tokens(self, session_id: uuid.UUID, tokens: SessionTokens) -> None:
        for h, s in self.by_hash.items():
            if s.id == session_id:
                self.by_hash[h] = with_tokens(s, tokens)

    async def delete(self, session_id: uuid.UUID) -> None:
        self.by_hash = {h: s for h, s in self.by_hash.items() if s.id != session_id}
