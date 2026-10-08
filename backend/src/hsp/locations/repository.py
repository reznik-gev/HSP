"""Persistence for locations. Services depend on the `LocationsRepository` protocol; unit tests
use an in-memory fake (docs/0061). Every query is tenant-scoped (docs/0003)."""

import uuid
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.models import AuditEvent, Building, Site


class LocationsRepository(Protocol):
    async def list_sites(
        self, tenant_id: uuid.UUID, *, include_archived: bool, after: uuid.UUID | None, limit: int
    ) -> list[Site]:
        """Up to `limit` sites ordered by id, starting after `after`."""
        ...

    async def get_site(self, tenant_id: uuid.UUID, site_id: uuid.UUID) -> Site | None: ...

    async def active_buildings(
        self, tenant_id: uuid.UUID, site_id: uuid.UUID
    ) -> list[Building]: ...

    def add(self, entity: Site | Building) -> None: ...

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

    async def active_buildings(self, tenant_id: uuid.UUID, site_id: uuid.UUID) -> list[Building]:
        q = select(Building).where(
            Building.tenant_id == tenant_id,
            Building.site_id == site_id,
            Building.archived_at.is_(None),
        )
        return list(await self._db.scalars(q.order_by(Building.id)))

    def add(self, entity: Site | Building) -> None:
        self._db.add(entity)

    def record(self, event: AuditEvent) -> None:
        self._db.add(event)

    async def commit(self) -> None:
        await self._db.commit()
