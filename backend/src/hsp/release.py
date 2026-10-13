"""What an archive, deactivation, reassignment or publish released (docs/0086).

Deletions free what they held automatically, in the same transaction: every release is audited
and reported back so the UI can say what happened (e.g. "Maya was unassigned from HT-3-04").
"""

import uuid

from pydantic import BaseModel, Field

from hsp import models
from hsp.audit import audit_event
from hsp.auth.principal import Principal


class ArchivedItem(BaseModel):
    kind: str
    id: uuid.UUID
    name: str


class FreedSeat(BaseModel):
    seat_id: uuid.UUID
    holder_person_id: uuid.UUID | None
    holder_unit_id: uuid.UUID | None


class PreviousMembership(BaseModel):
    unit_id: uuid.UUID
    position_id: uuid.UUID | None
    is_primary: bool


class MovedMember(BaseModel):
    person_id: uuid.UUID
    from_unit_ids: list[uuid.UUID]
    to_unit_id: uuid.UUID
    previous: list[PreviousMembership] = Field(
        default=[], description="The memberships the person had in the archived units"
    )
    merged: bool = Field(
        default=False,
        description="The person was already a member of to_unit_id (so Undo keeps that one)",
    )


class ReleaseReport(BaseModel):
    archived: list[ArchivedItem] = []
    freed_seats: list[FreedSeat] = []
    moved_members: list[MovedMember] = []


def freed(assignment: models.SeatAssignment) -> FreedSeat:
    return FreedSeat(
        seat_id=assignment.seat_element_id,
        holder_person_id=assignment.holder_person_id,
        holder_unit_id=assignment.holder_unit_id,
    )


def seat_unassigned(
    principal: Principal,
    assignment: models.SeatAssignment,
    *,
    reason: str,
    request_id: str | None,
) -> models.AuditEvent:
    """The audit event for one seat losing its holder as a side effect (docs/0031, docs/0086)."""
    return audit_event(
        principal,
        action="seat.unassigned",
        entity_type="seat",
        entity_id=assignment.seat_element_id,
        before={
            "holder_person_id": assignment.holder_person_id and str(assignment.holder_person_id),
            "holder_unit_id": assignment.holder_unit_id and str(assignment.holder_unit_id),
        },
        reason=reason,
        request_id=request_id,
    )
