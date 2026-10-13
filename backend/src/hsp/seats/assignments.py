"""Seat assignment (docs/0031, docs/0085, docs/0086).

A seat has at most one current holder: a person or a unit. Only seats that exist in the published
version of an active floor, in `assigned` mode, can be assigned. Assigning a taken seat reassigns
it and reports who was replaced (docs/0086). History lives in the audit log.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.audit import audit_event
from hsp.auth.principal import Principal
from hsp.problems import ProblemError, ProblemException
from hsp.release import FreedSeat, ReleaseReport, freed, seat_unassigned


class AssignmentIn(BaseModel):
    person_id: uuid.UUID | None = None
    unit_id: uuid.UUID | None = Field(default=None, description="Reserve the seat for a unit")
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _exactly_one_holder(self) -> "AssignmentIn":
        if (self.person_id is None) == (self.unit_id is None):
            raise ValueError("Give exactly one of person_id or unit_id.")
        return self


class AssignmentOut(BaseModel):
    holder_person_id: uuid.UUID | None
    holder_unit_id: uuid.UUID | None
    assigned_at: datetime
    assigned_by: str
    note: str | None


class SeatAssignmentOut(BaseModel):
    seat_id: uuid.UUID
    label: str | None
    floor_id: uuid.UUID
    assignment: AssignmentOut | None
    replaced: FreedSeat | None = Field(
        default=None, description="The previous holder, when this request reassigned the seat"
    )


@dataclass
class PublishedSeat:
    id: uuid.UUID
    label: str | None
    floor_id: uuid.UUID
    is_seat: bool
    mode: models.AllocationMode | None


def visible_at_published(rev: Any) -> Any:
    """The revision is part of its floor's published version (docs/0028)."""
    f = models.Floor
    return and_(
        f.published_version.is_not(None),
        rev.from_version <= f.published_version,
        or_(rev.to_version.is_(None), rev.to_version > f.published_version),
    )


def _out(a: models.SeatAssignment) -> AssignmentOut:
    return AssignmentOut(
        holder_person_id=a.holder_person_id,
        holder_unit_id=a.holder_unit_id,
        assigned_at=a.assigned_at,
        assigned_by=a.assigned_by,
        note=a.note,
    )


def _holder(a: models.SeatAssignment | None) -> dict[str, str | None] | None:
    if a is None:
        return None
    person, unit = a.holder_person_id, a.holder_unit_id
    return {
        "holder_person_id": str(person) if person else None,
        "holder_unit_id": str(unit) if unit else None,
    }


@dataclass
class SeatAssignmentService:
    db: AsyncSession
    principal: Principal
    request_id: str | None = None

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    async def _seat(self, seat_id: uuid.UUID) -> PublishedSeat:
        r, e, f, c = models.ObjectRev, models.FloorElement, models.Floor, models.CatalogItemRev
        row = (
            await self.db.execute(
                select(r.label, f.id, c.is_seat, r.allocation_mode)
                .join(e, e.id == r.element_id)
                .join(f, f.id == e.floor_id)
                .join(c, c.id == r.catalog_item_rev_id)
                .where(
                    r.element_id == seat_id,
                    f.tenant_id == self._tenant,
                    f.archived_at.is_(None),
                    visible_at_published(r),
                )
            )
        ).first()
        if row is None or not row[2]:
            raise ProblemException(
                404,
                "seat-not-found",
                "Seat not found",
                f"{seat_id} is not a seat in the published plan of an active floor.",
            )
        return PublishedSeat(seat_id, row[0], row[1], row[2], row[3])

    async def _current(self, seat_id: uuid.UUID) -> models.SeatAssignment | None:
        return await self.db.scalar(
            select(models.SeatAssignment).where(
                models.SeatAssignment.tenant_id == self._tenant,
                models.SeatAssignment.seat_element_id == seat_id,
            )
        )

    async def get(self, seat_id: uuid.UUID) -> SeatAssignmentOut:
        seat = await self._seat(seat_id)
        current = await self._current(seat_id)
        return SeatAssignmentOut(
            seat_id=seat.id,
            label=seat.label,
            floor_id=seat.floor_id,
            assignment=_out(current) if current else None,
        )

    async def _check_holder(self, body: AssignmentIn) -> None:
        if body.person_id is not None:
            p = await self.db.scalar(
                select(models.Person).where(
                    models.Person.tenant_id == self._tenant, models.Person.id == body.person_id
                )
            )
            problem = None if p is None or p.active else f"{p.display_name} is inactive."
            pointer, missing = "/person_id", p is None
        else:
            u = await self.db.scalar(
                select(models.OrgUnit).where(
                    models.OrgUnit.tenant_id == self._tenant, models.OrgUnit.id == body.unit_id
                )
            )
            problem = None if u is None or u.archived_at is None else f"{u.name} is archived."
            pointer, missing = "/unit_id", u is None
        if missing:
            raise ProblemException(
                422,
                "request-invalid",
                "Holder not found",
                errors=[
                    ProblemError(
                        code="holder_not_found", message="No such holder.", pointer=pointer
                    )
                ],
            )
        if problem:
            raise ProblemException(
                422,
                "holder-inactive",
                "Holder is inactive",
                f"{problem} Seats go only to active people and units (docs/0085).",
            )

    async def assign(self, seat_id: uuid.UUID, body: AssignmentIn) -> SeatAssignmentOut:
        seat = await self._seat(seat_id)
        if seat.mode != models.AllocationMode.ASSIGNED:
            raise ProblemException(
                409,
                "seat-not-assignable",
                "Seat isn't assignable",
                f"The seat is {seat.mode or 'without a mode'}; only 'assigned' seats can be "
                "assigned. Change its mode in the floor plan and publish.",
            )
        await self._check_holder(body)
        current = await self._current(seat_id)
        same = current is not None and (
            current.holder_person_id == body.person_id and current.holder_unit_id == body.unit_id
        )
        if same and current is not None:
            if current.note != body.note:
                current.note = body.note
                await self.db.commit()
            return SeatAssignmentOut(
                seat_id=seat.id, label=seat.label, floor_id=seat.floor_id, assignment=_out(current)
            )
        replaced = freed(current) if current else None
        before = _holder(current)
        if current is not None:  # docs/0086: reassign, and say who was replaced
            await self.db.delete(current)
            await self.db.flush()
        new = models.SeatAssignment(
            id=models.new_id(),
            tenant_id=self._tenant,
            seat_element_id=seat.id,
            holder_person_id=body.person_id,
            holder_unit_id=body.unit_id,
            assigned_at=datetime.now(UTC),
            assigned_by=self.principal.subject,
            note=body.note,
        )
        self.db.add(new)
        self.db.add(
            audit_event(
                self.principal,
                action="seat.assigned",
                entity_type="seat",
                entity_id=seat.id,
                before=before,
                after=_holder(new),
                request_id=self.request_id,
            )
        )
        await self.db.commit()
        return SeatAssignmentOut(
            seat_id=seat.id,
            label=seat.label,
            floor_id=seat.floor_id,
            assignment=_out(new),
            replaced=replaced,
        )

    async def unassign(self, seat_id: uuid.UUID) -> ReleaseReport:
        """Free the seat. Idempotent; works even if the seat has left the published plan."""
        current = await self._current(seat_id)
        if current is None:
            return ReleaseReport()
        await self.db.delete(current)
        self.db.add(
            seat_unassigned(
                self.principal, current, reason="Unassigned", request_id=self.request_id
            )
        )
        await self.db.commit()
        return ReleaseReport(freed_seats=[freed(current)])


async def free_person_seats(
    db: AsyncSession, principal: Principal, person: models.Person, request_id: str | None
) -> list[FreedSeat]:
    """A deactivated person holds no seats (docs/0085). The caller commits."""
    held = list(
        await db.scalars(
            select(models.SeatAssignment)
            .where(
                models.SeatAssignment.tenant_id == principal.tenant_id,
                models.SeatAssignment.holder_person_id == person.id,
            )
            .order_by(models.SeatAssignment.seat_element_id)
        )
    )
    if held:
        await db.execute(
            delete(models.SeatAssignment).where(models.SeatAssignment.id.in_([a.id for a in held]))
        )
    for a in held:
        db.add(
            seat_unassigned(
                principal, a, reason=f"{person.display_name} deactivated", request_id=request_id
            )
        )
    return [freed(a) for a in held]
