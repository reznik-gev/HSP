"""/api/v1/people and memberships (docs/0006, 0017, 0023, 0084)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.api.common import WRITE
from hsp.api.pagination import DEFAULT_LIMIT, CursorParam, LimitParam, Page, decode_cursor, page_of
from hsp.auth.dependencies import CurrentPrincipal
from hsp.db import get_session
from hsp.org.people import MembershipIn, PeopleService, PersonIn, PersonOut, PersonPatch

router = APIRouter(prefix="/people", tags=["organization"])


def get_service(
    request: Request, principal: CurrentPrincipal, db: Annotated[AsyncSession, Depends(get_session)]
) -> PeopleService:
    return PeopleService(db, principal, getattr(request.state, "request_id", None))


Service = Annotated[PeopleService, Depends(get_service)]


@router.get("")
async def list_people(
    service: Service,
    q: Annotated[str | None, Query(description="Search name or email")] = None,
    unit_id: Annotated[uuid.UUID | None, Query(description="Members of this unit")] = None,
    include_inactive: Annotated[bool, Query()] = False,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
) -> Page[PersonOut]:
    filters = {"q": q, "unit_id": unit_id, "include_inactive": include_inactive}
    rows = await service.list_people(
        q=q,
        unit_id=unit_id,
        include_inactive=include_inactive,
        after=decode_cursor(cursor, filters),
        limit=limit + 1,
    )
    return page_of(rows, limit, filters, lambda r: r)


@router.post("", status_code=201, dependencies=WRITE)
async def create_person(body: PersonIn, service: Service) -> PersonOut:
    return await service.create(body)


@router.get("/{person_id}")
async def get_person(person_id: uuid.UUID, service: Service) -> PersonOut:
    return await service.get(person_id)


@router.patch("/{person_id}", dependencies=WRITE)
async def update_person(person_id: uuid.UUID, body: PersonPatch, service: Service) -> PersonOut:
    return await service.update(person_id, body.model_dump(exclude_unset=True))


@router.delete("/{person_id}", dependencies=WRITE)
async def deactivate_person(person_id: uuid.UUID, service: Service) -> PersonOut:
    """Deactivate (people are never deleted, docs/0017)."""
    return await service.set_active(person_id, False)


@router.post("/{person_id}/reactivate", dependencies=WRITE)
async def reactivate_person(person_id: uuid.UUID, service: Service) -> PersonOut:
    return await service.set_active(person_id, True)


@router.put("/{person_id}/memberships", dependencies=WRITE)
async def set_memberships(
    person_id: uuid.UUID, body: list[MembershipIn], service: Service
) -> PersonOut:
    """Replace all memberships at once. Without an explicit primary, the deepest unit is primary
    (docs/0023)."""
    return await service.set_memberships(person_id, body)
