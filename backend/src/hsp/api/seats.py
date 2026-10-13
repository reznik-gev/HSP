"""/api/v1/seats: search and assignment (docs/0031, docs/0085, docs/0086)."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.api.common import WRITE
from hsp.api.pagination import DEFAULT_LIMIT, CursorParam, LimitParam, Page, decode_cursor, page_of
from hsp.auth.dependencies import CurrentPrincipal
from hsp.db import get_session
from hsp.release import ReleaseReport
from hsp.seats.assignments import AssignmentIn, SeatAssignmentOut, SeatAssignmentService
from hsp.seats.batch import BatchIn, BatchResult, SeatBatchService
from hsp.seats.search import SeatOut, SeatSearchService

router = APIRouter(prefix="/seats", tags=["seats"])
batch_router = APIRouter(prefix="/seat-assignments", tags=["seats"])


def get_service(
    request: Request, principal: CurrentPrincipal, db: Annotated[AsyncSession, Depends(get_session)]
) -> SeatAssignmentService:
    return SeatAssignmentService(db, principal, getattr(request.state, "request_id", None))


Service = Annotated[SeatAssignmentService, Depends(get_service)]


def get_search(
    principal: CurrentPrincipal, db: Annotated[AsyncSession, Depends(get_session)]
) -> SeatSearchService:
    return SeatSearchService(db, principal)


Search = Annotated[SeatSearchService, Depends(get_search)]


@router.get("")
async def search_seats(
    search: Search,
    q: Annotated[
        str | None,
        Query(
            description="Seat label, holder name or email, holding unit or holder's primary unit"
        ),
    ] = None,
    site_id: Annotated[uuid.UUID | None, Query()] = None,
    building_id: Annotated[uuid.UUID | None, Query()] = None,
    floor_id: Annotated[uuid.UUID | None, Query()] = None,
    holder_person_id: Annotated[uuid.UUID | None, Query()] = None,
    holder_unit_id: Annotated[uuid.UUID | None, Query()] = None,
    status: Annotated[
        Literal["assigned", "reserved", "free"] | None,
        Query(description="assigned = held by a person, reserved = held by a unit"),
    ] = None,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
) -> Page[SeatOut]:
    """ "Where does X sit?" over published plans of active floors, with each seat's place
    (site > building > floor) and holder (docs/0085)."""
    filters = {
        "q": q,
        "site_id": site_id,
        "building_id": building_id,
        "floor_id": floor_id,
        "holder_person_id": holder_person_id,
        "holder_unit_id": holder_unit_id,
        "status": status,
    }
    rows = await search.search(
        q=q,
        site_id=site_id,
        building_id=building_id,
        floor_id=floor_id,
        holder_person_id=holder_person_id,
        holder_unit_id=holder_unit_id,
        status=status,
        after=decode_cursor(cursor, filters),
        limit=limit + 1,
    )
    return page_of(rows, limit, filters, lambda r: r)


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


def get_batch(
    request: Request, principal: CurrentPrincipal, db: Annotated[AsyncSession, Depends(get_session)]
) -> SeatBatchService:
    return SeatBatchService(db, principal, getattr(request.state, "request_id", None))


@batch_router.post("/batch", dependencies=WRITE)
async def batch_assign(
    body: BatchIn, service: Annotated[SeatBatchService, Depends(get_batch)]
) -> BatchResult:
    """Assign, unassign and swap many seats at once, all or nothing (docs/0085). Steps run in
    order; 422 batch-invalid lists every failing step by `op_index` and changes nothing. The
    result shows the final state of every touched seat and who lost a seat."""
    return await service.apply(body)
