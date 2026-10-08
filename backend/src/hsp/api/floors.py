"""/api/v1/floors: floor records (docs/0035, docs/0078). Lengths are integer millimetres
(docs/0029). The floor *plan* (versions, draft, changesets) comes in later endpoints."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from hsp.api.common import WRITE, get_locations_repository
from hsp.api.pagination import DEFAULT_LIMIT, CursorParam, LimitParam, Page, decode_cursor, page_of
from hsp.auth.dependencies import CurrentPrincipal
from hsp.locations.floors import FloorsService
from hsp.locations.repository import LocationsRepository
from hsp.models import Floor

router = APIRouter(prefix="/floors", tags=["floors"])

Name = Annotated[str, Field(min_length=1, max_length=200)]
Level = Annotated[int, Field(ge=-20, le=200, description="0 = ground; negative = basement")]
Mm = Annotated[int, Field(ge=-1_000_000, le=1_000_000, description="Millimetres (docs/0029)")]
WallHeight = Annotated[int, Field(ge=1000, le=20_000, description="Millimetres")]


class FloorIn(BaseModel):
    building_id: uuid.UUID
    name: Name
    level_index: Level
    elevation_mm: Mm = 0
    default_wall_height_mm: WallHeight = 2800
    origin_x_mm: Mm = 0
    origin_y_mm: Mm = 0


class FloorPatch(BaseModel):
    name: Name | None = None
    level_index: Level | None = None
    elevation_mm: Mm | None = None
    default_wall_height_mm: WallHeight | None = None
    origin_x_mm: Mm | None = None
    origin_y_mm: Mm | None = None


class FloorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    building_id: uuid.UUID
    name: str
    level_index: int
    elevation_mm: int
    default_wall_height_mm: int
    origin_x_mm: int
    origin_y_mm: int
    published_version: int | None = Field(description="Null until the first publish (docs/0015)")
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


def get_service(
    request: Request,
    principal: CurrentPrincipal,
    repo: Annotated[LocationsRepository, Depends(get_locations_repository)],
) -> FloorsService:
    return FloorsService(repo, principal, getattr(request.state, "request_id", None))


Service = Annotated[FloorsService, Depends(get_service)]


def to_out(f: Floor) -> FloorOut:
    return FloorOut.model_validate(f)


@router.get("")
async def list_floors(
    service: Service,
    building_id: Annotated[uuid.UUID | None, Query()] = None,
    include_archived: Annotated[bool, Query()] = False,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
) -> Page[FloorOut]:
    filters = {"building_id": building_id, "include_archived": include_archived}
    rows = await service.list(
        building_id=building_id,
        include_archived=include_archived,
        after=decode_cursor(cursor, filters),
        limit=limit + 1,
    )
    return page_of(rows, limit, filters, to_out)


@router.post("", status_code=201, dependencies=WRITE)
async def create_floor(body: FloorIn, service: Service) -> FloorOut:
    return to_out(await service.create(**body.model_dump()))


@router.get("/{floor_id}")
async def get_floor(floor_id: uuid.UUID, service: Service) -> FloorOut:
    return to_out(await service.get(floor_id))


@router.patch("/{floor_id}", dependencies=WRITE)
async def update_floor(floor_id: uuid.UUID, body: FloorPatch, service: Service) -> FloorOut:
    return to_out(await service.update(floor_id, body.model_dump(exclude_unset=True)))


@router.delete("/{floor_id}", status_code=204, dependencies=WRITE)
async def archive_floor(floor_id: uuid.UUID, service: Service) -> Response:
    await service.archive(floor_id)
    return Response(status_code=204)


@router.post("/{floor_id}/restore", dependencies=WRITE)
async def restore_floor(floor_id: uuid.UUID, service: Service) -> FloorOut:
    """Refused with 409 while the building is archived: restore top-down (docs/0078)."""
    return to_out(await service.restore(floor_id))
