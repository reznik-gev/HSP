"""Occupancy: seat counts per floor, building, site and unit (docs/0025, docs/0085).

Counts cover the published plans of active floors; building and site totals roll up their floors.
Anyone logged in may read (docs/0027).
"""

import uuid
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.auth.principal import Principal
from hsp.problems import ProblemException
from hsp.seats.published import published_seats, visible_at_published


class Counts(BaseModel):
    total: int = 0
    assigned_to_people: int = 0
    reserved_for_units: int = 0
    free: int = Field(default=0, description="In assigned mode, with no holder")
    bookable: int = 0
    unavailable: int = 0

    def add(self, other: Counts) -> None:
        for field in Counts.model_fields:
            setattr(self, field, getattr(self, field) + getattr(other, field))


class FloorOccupancy(BaseModel):
    id: uuid.UUID
    name: str
    level_index: int
    counts: Counts


class BuildingOccupancy(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    counts: Counts
    floors: list[FloorOccupancy]


class SiteOccupancy(BaseModel):
    id: uuid.UUID
    name: str
    counts: Counts
    buildings: list[BuildingOccupancy]


class UnitOccupancy(BaseModel):
    id: uuid.UUID
    name: str
    include_sub_units: bool
    unit_held: int = Field(description="Seats reserved for the unit(s)")
    member_held: int = Field(description="Seats held by members of the unit(s)")
    members: int
    members_without_seat: int


def _total(parts: list[Any]) -> Counts:
    total = Counts()
    for part in parts:
        total.add(part.counts)
    return total


@dataclass
class OccupancyService:
    db: AsyncSession
    principal: Principal

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    async def _get(self, model: Any, entity_id: uuid.UUID, kind: str) -> Any:
        found = await self.db.scalar(
            select(model).where(model.tenant_id == self._tenant, model.id == entity_id)
        )
        if found is None:
            raise ProblemException(404, "not-found", "Not found", f"{kind} {entity_id} not found.")
        return found

    # --- Places -------------------------------------------------------------------------------

    async def floor(self, floor_id: uuid.UUID) -> FloorOccupancy:
        floor: models.Floor = await self._get(models.Floor, floor_id, "Floor")
        counts = (await self._floor_counts([floor.id]))[floor.id]
        return FloorOccupancy(
            id=floor.id, name=floor.name, level_index=floor.level_index, counts=counts
        )

    async def building(self, building_id: uuid.UUID) -> BuildingOccupancy:
        building: models.Building = await self._get(models.Building, building_id, "Building")
        return (await self._buildings([building]))[0]

    async def site(self, site_id: uuid.UUID) -> SiteOccupancy:
        site: models.Site = await self._get(models.Site, site_id, "Site")
        buildings = list(
            await self.db.scalars(
                select(models.Building)
                .where(
                    models.Building.tenant_id == self._tenant,
                    models.Building.site_id == site.id,
                    models.Building.archived_at.is_(None),
                )
                .order_by(models.Building.code)
            )
        )
        per_building = await self._buildings(buildings)
        return SiteOccupancy(
            id=site.id, name=site.name, counts=_total(per_building), buildings=per_building
        )

    async def _buildings(self, buildings: list[models.Building]) -> list[BuildingOccupancy]:
        floors = list(
            await self.db.scalars(
                select(models.Floor)
                .where(
                    models.Floor.tenant_id == self._tenant,
                    models.Floor.building_id.in_([b.id for b in buildings]),
                    models.Floor.archived_at.is_(None),
                )
                .order_by(models.Floor.level_index)
            )
        )
        counts = await self._floor_counts([f.id for f in floors])
        out = []
        for b in buildings:
            mine = [
                FloorOccupancy(id=f.id, name=f.name, level_index=f.level_index, counts=counts[f.id])
                for f in floors
                if f.building_id == b.id
            ]
            out.append(
                BuildingOccupancy(
                    id=b.id, name=b.name, code=b.code, counts=_total(mine), floors=mine
                )
            )
        return out

    async def _floor_counts(self, floor_ids: list[uuid.UUID]) -> dict[uuid.UUID, Counts]:
        out = {fid: Counts() for fid in floor_ids}
        if not floor_ids:
            return out
        r, e, c, f = models.ObjectRev, models.FloorElement, models.CatalogItemRev, models.Floor
        sa = models.SeatAssignment
        rows = await self.db.execute(
            select(
                e.floor_id,
                r.allocation_mode,
                func.count(),
                func.count(sa.holder_person_id),
                func.count(sa.holder_unit_id),
            )
            .join(e, e.id == r.element_id)
            .join(f, f.id == e.floor_id)
            .join(c, c.id == r.catalog_item_rev_id)
            .outerjoin(sa, sa.seat_element_id == r.element_id)
            .where(f.id.in_(floor_ids), c.is_seat.is_(True), visible_at_published(r))
            .group_by(e.floor_id, r.allocation_mode)
        )
        for floor_id, mode, total, people, units in rows:
            counts = out[floor_id]
            counts.total += total
            if mode == models.AllocationMode.ASSIGNED:
                counts.assigned_to_people += people
                counts.reserved_for_units += units
                counts.free += total - people - units
            elif mode == models.AllocationMode.BOOKABLE:
                counts.bookable += total
            else:
                counts.unavailable += total
        return out

    # --- Units --------------------------------------------------------------------------------

    async def unit(self, unit_id: uuid.UUID, include_sub_units: bool) -> UnitOccupancy:
        unit: models.OrgUnit = await self._get(models.OrgUnit, unit_id, "Unit")
        unit_ids = await self._with_sub_units(unit.id) if include_sub_units else [unit.id]
        r, sa = models.ObjectRev, models.SeatAssignment
        m, p = models.UnitMembership, models.Person
        seat_ids = published_seats(select(r.element_id).select_from(r), self._tenant)
        members = (
            select(m.person_id)
            .join(p, p.id == m.person_id)
            .where(m.unit_id.in_(unit_ids), p.active.is_(True))
            .distinct()
        )
        live = sa.seat_element_id.in_(seat_ids)
        unit_held = await self.db.scalar(
            select(func.count()).where(sa.holder_unit_id.in_(unit_ids), live)
        )
        member_held = await self.db.scalar(
            select(func.count()).where(sa.holder_person_id.in_(members), live)
        )
        seated = await self.db.scalar(
            select(func.count(func.distinct(sa.holder_person_id))).where(
                sa.holder_person_id.in_(members), live
            )
        )
        member_count = await self.db.scalar(select(func.count()).select_from(members.subquery()))
        return UnitOccupancy(
            id=unit.id,
            name=unit.name,
            include_sub_units=include_sub_units,
            unit_held=unit_held or 0,
            member_held=member_held or 0,
            members=member_count or 0,
            members_without_seat=(member_count or 0) - (seated or 0),
        )

    async def _with_sub_units(self, unit_id: uuid.UUID) -> list[uuid.UUID]:
        rows = await self.db.execute(
            select(models.OrgUnit.id, models.OrgUnit.parent_id).where(
                models.OrgUnit.tenant_id == self._tenant, models.OrgUnit.archived_at.is_(None)
            )
        )
        children: dict[uuid.UUID, list[uuid.UUID]] = {}
        for uid, parent in rows:
            if parent is not None:
                children.setdefault(parent, []).append(uid)
        out, queue = [unit_id], [unit_id]
        while queue:
            for child in children.get(queue.pop(), []):
                out.append(child)
                queue.append(child)
        return out
