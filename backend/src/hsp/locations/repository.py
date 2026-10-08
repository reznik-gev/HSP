"""Persistence for locations. Services depend on the `LocationsRepository` protocol; unit tests
use an in-memory fake (docs/0061). Every query is tenant-scoped (docs/0003)."""

import uuid
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.models import AuditEvent, Building, Floor, Site

Entity = Site | Building | Floor


class LocationsRepository(Protocol):
    async def list_sites(
        self, tenant_id: uuid.UUID, *, include_archived: bool, after: uuid.UUID | None, limit: int
    ) -> list[Site]:
        """Up to `limit` sites ordered by id, starting after `after`."""
        ...

    async def get_site(self, tenant_id: uuid.UUID, site_id: uuid.UUID) -> Site | None: ...

    async def list_buildings(
        self,
        tenant_id: uuid.UUID,
        *,
        site_id: uuid.UUID | None,
        include_archived: bool,
        after: uuid.UUID | None,
        limit: int,
    ) -> list[Building]: ...

    async def get_building(
        self, tenant_id: uuid.UUID, building_id: uuid.UUID
    ) -> Building | None: ...

    async def building_with_code(
        self, tenant_id: uuid.UUID, site_id: uuid.UUID, code: str
    ) -> Building | None:
        """Any building (archived included) using `code` in the site: codes are unique per site."""
        ...

    async def active_buildings(
        self, tenant_id: uuid.UUID, site_id: uuid.UUID
    ) -> list[Building]: ...

    async def active_floors(self, tenant_id: uuid.UUID, building_id: uuid.UUID) -> list[Floor]: ...

    async def list_floors(
        self,
        tenant_id: uuid.UUID,
        *,
        building_id: uuid.UUID | None,
        include_archived: bool,
        after: uuid.UUID | None,
        limit: int,
    ) -> list[Floor]: ...

    async def get_floor(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> Floor | None: ...

    async def floor_at_level(
        self, tenant_id: uuid.UUID, building_id: uuid.UUID, level_index: int
    ) -> Floor | None:
        """Any floor (archived included) at `level_index`: levels are unique per building."""
        ...

    def add(self, entity: Entity) -> None: ...

    def record(self, event: AuditEvent) -> None: ...

    async def commit(self) -> None: ...


class SqlLocationsRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_sites(
        self, tenant_id: uuid.UUID, *, include_archived: bool, after: uuid.UUID | None, limit: int
    ) -> list[Site]:
        q = select(Site).where(Site.tenant_id == tenant_id)
        if not include_archived:
            q = q.where(Site.archived_at.is_(None))
        if after is not None:
            q = q.where(Site.id > after)
        return list(await self._db.scalars(q.order_by(Site.id).limit(limit)))

    async def get_site(self, tenant_id: uuid.UUID, site_id: uuid.UUID) -> Site | None:
        return await self._db.scalar(
            select(Site).where(Site.tenant_id == tenant_id, Site.id == site_id)
        )

    async def list_buildings(
        self,
        tenant_id: uuid.UUID,
        *,
        site_id: uuid.UUID | None,
        include_archived: bool,
        after: uuid.UUID | None,
        limit: int,
    ) -> list[Building]:
        q = select(Building).where(Building.tenant_id == tenant_id)
        if site_id is not None:
            q = q.where(Building.site_id == site_id)
        if not include_archived:
            q = q.where(Building.archived_at.is_(None))
        if after is not None:
            q = q.where(Building.id > after)
        return list(await self._db.scalars(q.order_by(Building.id).limit(limit)))

    async def get_building(self, tenant_id: uuid.UUID, building_id: uuid.UUID) -> Building | None:
        return await self._db.scalar(
            select(Building).where(Building.tenant_id == tenant_id, Building.id == building_id)
        )

    async def building_with_code(
        self, tenant_id: uuid.UUID, site_id: uuid.UUID, code: str
    ) -> Building | None:
        return await self._db.scalar(
            select(Building).where(
                Building.tenant_id == tenant_id, Building.site_id == site_id, Building.code == code
            )
        )

    async def active_buildings(self, tenant_id: uuid.UUID, site_id: uuid.UUID) -> list[Building]:
        q = select(Building).where(
            Building.tenant_id == tenant_id,
            Building.site_id == site_id,
            Building.archived_at.is_(None),
        )
        return list(await self._db.scalars(q.order_by(Building.id)))

    async def active_floors(self, tenant_id: uuid.UUID, building_id: uuid.UUID) -> list[Floor]:
        q = select(Floor).where(
            Floor.tenant_id == tenant_id,
            Floor.building_id == building_id,
            Floor.archived_at.is_(None),
        )
        return list(await self._db.scalars(q.order_by(Floor.level_index)))

    async def list_floors(
        self,
        tenant_id: uuid.UUID,
        *,
        building_id: uuid.UUID | None,
        include_archived: bool,
        after: uuid.UUID | None,
        limit: int,
    ) -> list[Floor]:
        q = select(Floor).where(Floor.tenant_id == tenant_id)
        if building_id is not None:
            q = q.where(Floor.building_id == building_id)
        if not include_archived:
            q = q.where(Floor.archived_at.is_(None))
        if after is not None:
            q = q.where(Floor.id > after)
        return list(await self._db.scalars(q.order_by(Floor.id).limit(limit)))

    async def get_floor(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> Floor | None:
        return await self._db.scalar(
            select(Floor).where(Floor.tenant_id == tenant_id, Floor.id == floor_id)
        )

    async def floor_at_level(
        self, tenant_id: uuid.UUID, building_id: uuid.UUID, level_index: int
    ) -> Floor | None:
        return await self._db.scalar(
            select(Floor).where(
                Floor.tenant_id == tenant_id,
                Floor.building_id == building_id,
                Floor.level_index == level_index,
            )
        )

    def add(self, entity: Entity) -> None:
        self._db.add(entity)

    def record(self, event: AuditEvent) -> None:
        self._db.add(event)

    async def commit(self) -> None:
        await self._db.commit()
