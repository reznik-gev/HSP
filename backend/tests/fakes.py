"""In-memory fakes of repository interfaces for unit tests (docs/0061)."""

import uuid

from hsp.auth.sessions import Session, SessionTokens, with_tokens
from hsp.models import AuditEvent, Building, Site, new_id


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


class InMemoryLocationsRepository:
    """Fake LocationsRepository. `committed` counts commits; `events` holds audit records."""

    def __init__(self) -> None:
        self.sites: dict[uuid.UUID, Site] = {}
        self.buildings: dict[uuid.UUID, Building] = {}
        self.events: list[AuditEvent] = []
        self._pending: list[Site | Building | AuditEvent] = []
        self.committed = 0

    async def list_sites(
        self, tenant_id: uuid.UUID, *, include_archived: bool, after: uuid.UUID | None, limit: int
    ) -> list[Site]:
        rows = sorted(
            (s for s in self.sites.values() if s.tenant_id == tenant_id),
            key=lambda s: s.id,
        )
        rows = [s for s in rows if include_archived or s.archived_at is None]
        rows = [s for s in rows if after is None or s.id > after]
        return rows[:limit]

    async def get_site(self, tenant_id: uuid.UUID, site_id: uuid.UUID) -> Site | None:
        site = self.sites.get(site_id)
        return site if site and site.tenant_id == tenant_id else None

    async def active_buildings(self, tenant_id: uuid.UUID, site_id: uuid.UUID) -> list[Building]:
        return [
            b
            for b in self.buildings.values()
            if b.tenant_id == tenant_id and b.site_id == site_id and b.archived_at is None
        ]

    def add(self, entity: Site | Building) -> None:
        self._pending.append(entity)

    def record(self, event: AuditEvent) -> None:
        self._pending.append(event)

    async def commit(self) -> None:
        for item in self._pending:
            if isinstance(item, Site):
                self.sites[item.id] = item
            elif isinstance(item, Building):
                self.buildings[item.id] = item
            else:
                self.events.append(item)
        self._pending.clear()
        self.committed += 1
