"""In-memory fakes of repository interfaces for unit tests (docs/0061)."""

import uuid
from typing import Any

from hsp.auth.sessions import Session, SessionTokens, with_tokens
from hsp.models import AuditEvent, Building, Floor, Site, new_id


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
        self.floors: dict[uuid.UUID, Floor] = {}
        self.events: list[AuditEvent] = []
        self._pending: list[Site | Building | Floor | AuditEvent] = []
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

    async def list_buildings(
        self,
        tenant_id: uuid.UUID,
        *,
        site_id: uuid.UUID | None,
        include_archived: bool,
        after: uuid.UUID | None,
        limit: int,
    ) -> list[Building]:
        rows = sorted(
            (b for b in self.buildings.values() if b.tenant_id == tenant_id), key=lambda b: b.id
        )
        rows = [b for b in rows if site_id is None or b.site_id == site_id]
        rows = [b for b in rows if include_archived or b.archived_at is None]
        rows = [b for b in rows if after is None or b.id > after]
        return rows[:limit]

    async def get_building(self, tenant_id: uuid.UUID, building_id: uuid.UUID) -> Building | None:
        b = self.buildings.get(building_id)
        return b if b and b.tenant_id == tenant_id else None

    async def building_with_code(
        self, tenant_id: uuid.UUID, site_id: uuid.UUID, code: str
    ) -> Building | None:
        return next(
            (
                b
                for b in self.buildings.values()
                if b.tenant_id == tenant_id and b.site_id == site_id and b.code == code
            ),
            None,
        )

    async def active_floors(self, tenant_id: uuid.UUID, building_id: uuid.UUID) -> list[Floor]:
        return [
            f
            for f in self.floors.values()
            if f.tenant_id == tenant_id and f.building_id == building_id and f.archived_at is None
        ]

    async def list_floors(
        self,
        tenant_id: uuid.UUID,
        *,
        building_id: uuid.UUID | None,
        include_archived: bool,
        after: uuid.UUID | None,
        limit: int,
    ) -> list[Floor]:
        rows = sorted(
            (f for f in self.floors.values() if f.tenant_id == tenant_id), key=lambda f: f.id
        )
        rows = [f for f in rows if building_id is None or f.building_id == building_id]
        rows = [f for f in rows if include_archived or f.archived_at is None]
        rows = [f for f in rows if after is None or f.id > after]
        return rows[:limit]

    async def get_floor(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> Floor | None:
        f = self.floors.get(floor_id)
        return f if f and f.tenant_id == tenant_id else None

    async def floor_at_level(
        self, tenant_id: uuid.UUID, building_id: uuid.UUID, level_index: int
    ) -> Floor | None:
        return next(
            (
                f
                for f in self.floors.values()
                if f.tenant_id == tenant_id
                and f.building_id == building_id
                and f.level_index == level_index
            ),
            None,
        )

    def add(self, entity: Site | Building | Floor) -> None:
        self._pending.append(entity)

    def record(self, event: AuditEvent) -> None:
        self._pending.append(event)

    async def commit(self) -> None:
        for item in self._pending:
            if isinstance(item, Site):
                self.sites[item.id] = item
            elif isinstance(item, Building):
                self.buildings[item.id] = item
            elif isinstance(item, Floor):
                self.floors[item.id] = item
            else:
                self.events.append(item)
        self._pending.clear()
        self.committed += 1


class InMemoryPlanRepository:
    """Fake PlanRepository: versions and per-version content keyed by floor (docs/0061)."""

    def __init__(self, tenant_id: uuid.UUID) -> None:
        from hsp.plans.schema import FloorVersion, PlanContent

        self.tenant_id = tenant_id
        self.versions: dict[uuid.UUID, list[FloorVersion]] = {}
        self.content: dict[tuple[uuid.UUID, int], PlanContent] = {}

    async def floor_exists(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> bool:
        return tenant_id == self.tenant_id and floor_id in self.versions

    async def list_versions(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> list[Any]:
        return list(self.versions.get(floor_id, [])) if tenant_id == self.tenant_id else []

    async def load_content(self, tenant_id: uuid.UUID, floor_id: uuid.UUID, version: int) -> Any:
        from hsp.plans.schema import PlanContent

        return self.content.get((floor_id, version), PlanContent())
