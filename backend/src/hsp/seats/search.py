"""Seat search ("where does X sit?") and occupancy (docs/0025, docs/0085).

Both read the published plans of active floors: a seat is a placed object whose catalog item is
a seat. Assignments come from `seat_assignment`. Anyone logged in may read (docs/0027).
"""

import uuid
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from hsp import models
from hsp.auth.principal import Principal
from hsp.problems import ProblemException
from hsp.seats.assignments import visible_at_published

# --- Search -----------------------------------------------------------------------------------


class Ref(BaseModel):
    id: uuid.UUID
    name: str


class HolderPerson(BaseModel):
    id: uuid.UUID
    display_name: str
    email: str
    primary_unit: Ref | None


class SeatOut(BaseModel):
    id: uuid.UUID = Field(description="The seat's element id")
    label: str | None
    allocation_mode: str | None
    site: Ref
    building: Ref
    floor: Ref
    holder_person: HolderPerson | None
    holder_unit: Ref | None


# --- Occupancy --------------------------------------------------------------------------------


class Counts(BaseModel):
    total: int = 0
    assigned_to_people: int = 0
    reserved_for_units: int = 0
    free: int = Field(default=0, description="In assigned mode, with no holder")
    bookable: int = 0
    unavailable: int = 0

    def add(self, other: "Counts") -> None:
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


def _escape(q: str) -> str:
    return "%" + q.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_") + "%"


@dataclass
class SeatSearchService:
    db: AsyncSession
    principal: Principal

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    def _published_seats(self, query: Any) -> Any:
        """Restrict a query over `ObjectRev` to seats in published plans of active floors."""
        r, e, f, c = models.ObjectRev, models.FloorElement, models.Floor, models.CatalogItemRev
        b, s = models.Building, models.Site
        return (
            query.join(e, e.id == r.element_id)
            .join(f, f.id == e.floor_id)
            .join(b, b.id == f.building_id)
            .join(s, s.id == b.site_id)
            .join(c, c.id == r.catalog_item_rev_id)
            .where(
                f.tenant_id == self._tenant,
                f.archived_at.is_(None),
                b.archived_at.is_(None),
                s.archived_at.is_(None),
                c.is_seat.is_(True),
                visible_at_published(r),
            )
        )

    async def search(
        self,
        *,
        q: str | None,
        site_id: uuid.UUID | None,
        building_id: uuid.UUID | None,
        floor_id: uuid.UUID | None,
        holder_person_id: uuid.UUID | None,
        holder_unit_id: uuid.UUID | None,
        status: str | None,
        after: uuid.UUID | None,
        limit: int,
    ) -> list[SeatOut]:
        r, f, b, s = models.ObjectRev, models.Floor, models.Building, models.Site
        sa, p, m = models.SeatAssignment, models.Person, models.UnitMembership
        holder_unit, primary_unit = aliased(models.OrgUnit), aliased(models.OrgUnit)
        query = self._published_seats(
            select(
                r.element_id,
                r.label,
                r.allocation_mode,
                s.id,
                s.name,
                b.id,
                b.name,
                f.id,
                f.name,
                p.id,
                p.display_name,
                p.email,
                primary_unit.id,
                primary_unit.name,
                holder_unit.id,
                holder_unit.name,
            ).select_from(r)
        )
        query = (
            query.outerjoin(sa, sa.seat_element_id == r.element_id)
            .outerjoin(p, p.id == sa.holder_person_id)
            .outerjoin(m, and_(m.person_id == p.id, m.is_primary.is_(True)))
            .outerjoin(primary_unit, primary_unit.id == m.unit_id)
            .outerjoin(holder_unit, holder_unit.id == sa.holder_unit_id)
        )
        if q:
            pattern = _escape(q)
            query = query.where(
                or_(
                    r.label.ilike(pattern),
                    p.display_name.ilike(pattern),
                    p.email.ilike(pattern),
                    holder_unit.name.ilike(pattern),
                    primary_unit.name.ilike(pattern),
                )
            )
        for column, value in ((s.id, site_id), (b.id, building_id), (f.id, floor_id)):
            if value is not None:
                query = query.where(column == value)
        if holder_person_id is not None:
            query = query.where(sa.holder_person_id == holder_person_id)
        if holder_unit_id is not None:
            query = query.where(sa.holder_unit_id == holder_unit_id)
        if status == "assigned":
            query = query.where(sa.holder_person_id.is_not(None))
        elif status == "reserved":
            query = query.where(sa.holder_unit_id.is_not(None))
        elif status == "free":
            query = query.where(
                sa.id.is_(None), r.allocation_mode == models.AllocationMode.ASSIGNED
            )
        if after is not None:
            query = query.where(r.element_id > after)
        rows = (await self.db.execute(query.order_by(r.element_id).limit(limit))).all()
        return [
            SeatOut(
                id=row[0],
                label=row[1],
                allocation_mode=row[2],
                site=Ref(id=row[3], name=row[4]),
                building=Ref(id=row[5], name=row[6]),
                floor=Ref(id=row[7], name=row[8]),
                holder_person=HolderPerson(
                    id=row[9],
                    display_name=row[10],
                    email=row[11],
                    primary_unit=Ref(id=row[12], name=row[13]) if row[12] else None,
                )
                if row[9]
                else None,
                holder_unit=Ref(id=row[14], name=row[15]) if row[14] else None,
            )
            for row in rows
        ]

    # --- Occupancy ----------------------------------------------------------------------------

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

    async def _get(self, model: Any, entity_id: uuid.UUID, kind: str) -> Any:
        found = await self.db.scalar(
            select(model).where(model.tenant_id == self._tenant, model.id == entity_id)
        )
        if found is None:
            raise ProblemException(404, "not-found", "Not found", f"{kind} {entity_id} not found.")
        return found

    async def _floors(self, building_ids: list[uuid.UUID]) -> list[models.Floor]:
        return list(
            await self.db.scalars(
                select(models.Floor)
                .where(
                    models.Floor.tenant_id == self._tenant,
                    models.Floor.building_id.in_(building_ids),
                    models.Floor.archived_at.is_(None),
                )
                .order_by(models.Floor.level_index)
            )
        )

    async def floor(self, floor_id: uuid.UUID) -> FloorOccupancy:
        floor: models.Floor = await self._get(models.Floor, floor_id, "Floor")
        counts = (await self._floor_counts([floor.id]))[floor.id]
        return FloorOccupancy(
            id=floor.id, name=floor.name, level_index=floor.level_index, counts=counts
        )

    async def _buildings(self, buildings: list[models.Building]) -> list[BuildingOccupancy]:
        floors = await self._floors([b.id for b in buildings])
        counts = await self._floor_counts([f.id for f in floors])
        out = []
        for b in buildings:
            mine = [
                FloorOccupancy(id=f.id, name=f.name, level_index=f.level_index, counts=counts[f.id])
                for f in floors
                if f.building_id == b.id
            ]
            total = Counts()
            for f in mine:
                total.add(f.counts)
            out.append(
                BuildingOccupancy(id=b.id, name=b.name, code=b.code, counts=total, floors=mine)
            )
        return out

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
        total = Counts()
        for b in per_building:
            total.add(b.counts)
        return SiteOccupancy(id=site.id, name=site.name, counts=total, buildings=per_building)

    async def unit(self, unit_id: uuid.UUID, include_sub_units: bool) -> UnitOccupancy:
        unit: models.OrgUnit = await self._get(models.OrgUnit, unit_id, "Unit")
        unit_ids = [unit.id]
        if include_sub_units:
            rows = (
                await self.db.execute(
                    select(models.OrgUnit.id, models.OrgUnit.parent_id).where(
                        models.OrgUnit.tenant_id == self._tenant,
                        models.OrgUnit.archived_at.is_(None),
                    )
                )
            ).all()
            children: dict[uuid.UUID, list[uuid.UUID]] = {}
            for uid, parent in rows:
                if parent is not None:
                    children.setdefault(parent, []).append(uid)
            queue = [unit.id]
            while queue:
                for child in children.get(queue.pop(), []):
                    unit_ids.append(child)
                    queue.append(child)
        r = models.ObjectRev
        seat_ids = self._published_seats(select(r.element_id).select_from(r))
        sa, m, p = models.SeatAssignment, models.UnitMembership, models.Person
        members = (
            select(m.person_id)
            .join(p, p.id == m.person_id)
            .where(m.unit_id.in_(unit_ids), p.active.is_(True))
            .distinct()
        )
        unit_held = await self.db.scalar(
            select(func.count()).where(
                sa.holder_unit_id.in_(unit_ids), sa.seat_element_id.in_(seat_ids)
            )
        )
        member_held = await self.db.scalar(
            select(func.count()).where(
                sa.holder_person_id.in_(members), sa.seat_element_id.in_(seat_ids)
            )
        )
        member_count = await self.db.scalar(select(func.count()).select_from(members.subquery()))
        seated = await self.db.scalar(
            select(func.count(func.distinct(sa.holder_person_id))).where(
                sa.holder_person_id.in_(members), sa.seat_element_id.in_(seat_ids)
            )
        )
        return UnitOccupancy(
            id=unit.id,
            name=unit.name,
            include_sub_units=include_sub_units,
            unit_held=unit_held or 0,
            member_held=member_held or 0,
            members=member_count or 0,
            members_without_seat=(member_count or 0) - (seated or 0),
        )
