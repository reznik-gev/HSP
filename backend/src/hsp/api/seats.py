"""/api/v1/seats/{seat_id}/assignment (docs/0031, docs/0085, docs/0086)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.api.common import WRITE
from hsp.auth.dependencies import CurrentPrincipal
from hsp.db import get_session
from hsp.release import ReleaseReport
from hsp.seats.assignments import AssignmentIn, SeatAssignmentOut, SeatAssignmentService

router = APIRouter(prefix="/seats", tags=["seats"])


def get_service(
    request: Request, principal: CurrentPrincipal, db: Annotated[AsyncSession, Depends(get_session)]
) -> SeatAssignmentService:
    return SeatAssignmentService(db, principal, getattr(request.state, "request_id", None))


Service = Annotated[SeatAssignmentService, Depends(get_service)]


@router.get("/{seat_id}/assignment")
async def get_assignment(seat_id: uuid.UUID, service: Service) -> SeatAssignmentOut:
    """Who holds the seat; `assignment` is null when it's free."""
    return await service.get(seat_id)


@router.put("/{seat_id}/assignment", dependencies=WRITE)
async def assign_seat(
    seat_id: uuid.UUID, body: AssignmentIn, service: Service
) -> SeatAssignmentOut:
    """Give the seat to a person or reserve it for a unit. Only published seats in `assigned`
    mode (409 seat-not-assignable otherwise); the holder must be active (422 holder-inactive).
    A taken seat is reassigned, and `replaced` names the previous holder (docs/0086)."""
    return await service.assign(seat_id, body)


@router.delete("/{seat_id}/assignment", dependencies=WRITE)
async def unassign_seat(seat_id: uuid.UUID, service: Service) -> ReleaseReport:
    """Free the seat. Idempotent."""
    return await service.unassign(seat_id)
