"""/api/v1/org-units and positions (docs/0006, docs/0084)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.api.common import WRITE
from hsp.api.pagination import DEFAULT_LIMIT, CursorParam, LimitParam, Page, decode_cursor, page_of
from hsp.auth.dependencies import CurrentPrincipal
from hsp.db import get_session
from hsp.org.units import (
    PositionIn,
    PositionOut,
    UnitIn,
    UnitOut,
    UnitPatch,
    UnitsService,
    unit_out,
)
from hsp.release import ReleaseReport

router = APIRouter(tags=["organization"])


def get_service(
    request: Request, principal: CurrentPrincipal, db: Annotated[AsyncSession, Depends(get_session)]
) -> UnitsService:
    return UnitsService(db, principal, getattr(request.state, "request_id", None))


Service = Annotated[UnitsService, Depends(get_service)]


@router.get("/org-units")
async def list_units(
    service: Service,
    include_archived: Annotated[bool, Query()] = False,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
) -> Page[UnitOut]:
    """Units as a flat list; build the tree from `parent_id`."""
    filters = {"include_archived": include_archived}
    rows = await service.list_units(
        include_archived=include_archived, after=decode_cursor(cursor, filters), limit=limit + 1
    )
    return page_of(rows, limit, filters, lambda r: r)


@router.post("/org-units", status_code=201, dependencies=WRITE)
async def create_unit(body: UnitIn, service: Service) -> UnitOut:
    """`parent_id` null creates the root (409 root-exists if there is one)."""
    return await service.create(body)


@router.get("/org-units/{unit_id}")
async def get_unit(unit_id: uuid.UUID, service: Service) -> UnitOut:
    return unit_out(await service.get_unit(unit_id))


@router.patch("/org-units/{unit_id}", dependencies=WRITE)
async def update_unit(unit_id: uuid.UUID, body: UnitPatch, service: Service) -> UnitOut:
    """Rename, relabel or move (`parent_id`); moving under a own sub-unit is 409 unit-cycle."""
    return await service.update(unit_id, body.model_dump(exclude_unset=True))


@router.delete("/org-units/{unit_id}", dependencies=WRITE)
async def archive_unit(unit_id: uuid.UUID, service: Service) -> ReleaseReport:
    """Archive the unit and its active sub-units (docs/0086). Members move up to the parent unit,
    keeping their primary flag; seats held by the archived units are freed. 409 root-unit for the
    root. The response lists everything archived, moved and freed."""
    return await service.archive(unit_id)


@router.post("/org-units/{unit_id}/restore", dependencies=WRITE)
async def restore_unit(unit_id: uuid.UUID, service: Service) -> UnitOut:
    return await service.restore(unit_id)


@router.get("/org-units/{unit_id}/positions")
async def list_positions(unit_id: uuid.UUID, service: Service) -> Page[PositionOut]:
    return Page[PositionOut](items=await service.positions(unit_id), next_cursor=None)


@router.post("/org-units/{unit_id}/positions", status_code=201, dependencies=WRITE)
async def create_position(unit_id: uuid.UUID, body: PositionIn, service: Service) -> PositionOut:
    return await service.create_position(unit_id, body)


@router.patch("/positions/{position_id}", dependencies=WRITE)
async def rename_position(
    position_id: uuid.UUID, body: PositionIn, service: Service
) -> PositionOut:
    return await service.rename_position(position_id, body)


@router.delete("/positions/{position_id}", status_code=204, dependencies=WRITE)
async def delete_position(position_id: uuid.UUID, service: Service) -> Response:
    """People holding the position keep their unit membership, without a position (docs/0084)."""
    await service.delete_position(position_id)
    return Response(status_code=204)
