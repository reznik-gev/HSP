"""/api/v1/buildings (docs/0035, docs/0078). Reading needs a session; changes need hsp-admin +
CSRF."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from hsp.api.common import WRITE, get_locations_repository
from hsp.api.pagination import DEFAULT_LIMIT, CursorParam, LimitParam, Page, decode_cursor, page_of
from hsp.auth.dependencies import CurrentPrincipal
from hsp.locations.buildings import BuildingsService
from hsp.locations.repository import LocationsRepository
from hsp.models import Building

router = APIRouter(prefix="/buildings", tags=["buildings"])

Code = Annotated[str, Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9._-]+$")]


class BuildingIn(BaseModel):
    site_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    code: Code = Field(description="Short code, unique within the site (e.g. A, HQ-1)")


class BuildingPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: Code | None = None


class BuildingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    site_id: uuid.UUID
    name: str
    code: str
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


def get_service(
    request: Request,
    principal: CurrentPrincipal,
    repo: Annotated[LocationsRepository, Depends(get_locations_repository)],
) -> BuildingsService:
    return BuildingsService(repo, principal, getattr(request.state, "request_id", None))


Service = Annotated[BuildingsService, Depends(get_service)]


def to_out(b: Building) -> BuildingOut:
    return BuildingOut.model_validate(b)


@router.get("")
async def list_buildings(
    service: Service,
    site_id: Annotated[uuid.UUID | None, Query()] = None,
    include_archived: Annotated[bool, Query()] = False,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
) -> Page[BuildingOut]:
    filters = {"site_id": site_id, "include_archived": include_archived}
    rows = await service.list(
        site_id=site_id,
        include_archived=include_archived,
        after=decode_cursor(cursor, filters),
        limit=limit + 1,
    )
    return page_of(rows, limit, filters, to_out)


@router.post("", status_code=201, dependencies=WRITE)
async def create_building(body: BuildingIn, service: Service) -> BuildingOut:
    return to_out(await service.create(**body.model_dump()))


@router.get("/{building_id}")
async def get_building(building_id: uuid.UUID, service: Service) -> BuildingOut:
    return to_out(await service.get(building_id))


@router.patch("/{building_id}", dependencies=WRITE)
async def update_building(
    building_id: uuid.UUID, body: BuildingPatch, service: Service
) -> BuildingOut:
    return to_out(await service.update(building_id, body.model_dump(exclude_unset=True)))


@router.delete("/{building_id}", status_code=204, dependencies=WRITE)
async def archive_building(building_id: uuid.UUID, service: Service) -> Response:
    """Archive (soft delete). Refused with 409 while active floors exist (docs/0078)."""
    await service.archive(building_id)
    return Response(status_code=204)


@router.post("/{building_id}/restore", dependencies=WRITE)
async def restore_building(building_id: uuid.UUID, service: Service) -> BuildingOut:
    """Refused with 409 while the site is archived: restore top-down (docs/0078)."""
    return to_out(await service.restore(building_id))
