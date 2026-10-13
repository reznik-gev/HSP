"""/api/v1/sites (docs/0035, docs/0078). Reading needs a session; changes need hsp-admin + CSRF."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from hsp.api.common import WRITE, get_locations_repository
from hsp.api.pagination import DEFAULT_LIMIT, CursorParam, LimitParam, Page, decode_cursor, page_of
from hsp.auth.dependencies import CurrentPrincipal
from hsp.locations.repository import LocationsRepository
from hsp.locations.sites import SitesService
from hsp.models import Site
from hsp.release import ReleaseReport

router = APIRouter(prefix="/sites", tags=["sites"])


class SiteIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str | None = None
    time_zone: str = Field(description="IANA time zone, e.g. Europe/Berlin")


class SitePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = None
    time_zone: str | None = None


class SiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    address: str | None
    time_zone: str
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


def get_service(
    request: Request,
    principal: CurrentPrincipal,
    repo: Annotated[LocationsRepository, Depends(get_locations_repository)],
) -> SitesService:
    return SitesService(repo, principal, getattr(request.state, "request_id", None))


Service = Annotated[SitesService, Depends(get_service)]


def to_out(site: Site) -> SiteOut:
    return SiteOut.model_validate(site)


@router.get("")
async def list_sites(
    service: Service,
    include_archived: Annotated[bool, Query()] = False,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
) -> Page[SiteOut]:
    filters = {"include_archived": include_archived}
    rows = await service.list(
        include_archived=include_archived, after=decode_cursor(cursor, filters), limit=limit + 1
    )
    return page_of(rows, limit, filters, to_out)


@router.post("", status_code=201, dependencies=WRITE)
async def create_site(body: SiteIn, service: Service) -> SiteOut:
    return to_out(await service.create(**body.model_dump()))


@router.get("/{site_id}")
async def get_site(site_id: uuid.UUID, service: Service) -> SiteOut:
    return to_out(await service.get(site_id))


@router.patch("/{site_id}", dependencies=WRITE)
async def update_site(site_id: uuid.UUID, body: SitePatch, service: Service) -> SiteOut:
    return to_out(await service.update(site_id, body.model_dump(exclude_unset=True)))


@router.delete("/{site_id}", dependencies=WRITE)
async def archive_site(site_id: uuid.UUID, service: Service) -> ReleaseReport:
    """Archive (soft delete, docs/0078). Cascades to its active buildings and their floors;
    archived floors free their assigned seats. The response lists everything archived and freed
    (docs/0086)."""
    return await service.archive(site_id)


@router.post("/{site_id}/restore", dependencies=WRITE)
async def restore_site(site_id: uuid.UUID, service: Service) -> SiteOut:
    return to_out(await service.restore(site_id))
