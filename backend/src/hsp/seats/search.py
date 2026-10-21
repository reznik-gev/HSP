"""Seat search: "where does X sit?" (docs/0025, docs/0085).

One `q` matches the seat label, the holder's name or email, the holding unit and the holder's
primary unit, over the published plans of active floors. Anyone logged in may read (docs/0027).
"""

import uuid
from dataclasses import dataclass

from pydantic import BaseModel, Field
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from hsp import models
from hsp.auth.principal import Principal
from hsp.seats.published import published_seats, visible_at_published


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


def _escape(q: str) -> str:
    return "%" + q.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_") + "%"


@dataclass
class SeatSearchService:
    db: AsyncSession
    principal: Principal

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

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
        zone_id: uuid.UUID | None,
        after: uuid.UUID | None,
        limit: int,
    ) -> list[SeatOut]:
        r, f, b, s = models.ObjectRev, models.Floor, models.Building, models.Site
        sa, p, m = models.SeatAssignment, models.Person, models.UnitMembership
        holder_unit, primary_unit = aliased(models.OrgUnit), aliased(models.OrgUnit)
        query = published_seats(
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
            ).select_from(r),
            self._tenant,
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
        elif status == "bookable":
            query = query.where(
                sa.id.is_(None), r.allocation_mode == models.AllocationMode.BOOKABLE
            )
        elif status == "available":
            # Free to assign or to book: the free seats list (docs/0108).
            query = query.where(
                sa.id.is_(None),
                r.allocation_mode.in_(
                    [models.AllocationMode.ASSIGNED, models.AllocationMode.BOOKABLE]
                ),
            )
        if zone_id is not None:
            # Seats whose position lies in that zone of the same floor's published plan.
            z, ze = models.ZoneRev, aliased(models.FloorElement)
            query = query.where(
                exists(
                    select(z.element_id)
                    .join(ze, ze.id == z.element_id)
                    .where(
                        z.element_id == zone_id,
                        ze.floor_id == f.id,
                        visible_at_published(z),
                        func.ST_Contains(z.boundary, func.ST_Force2D(r.position)),
                    )
                )
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
