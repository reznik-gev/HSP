"""/api/v1/zone-types and /api/v1/catalog-items (docs/0020, 0021, 0083)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.api.common import WRITE
from hsp.api.pagination import DEFAULT_LIMIT, CursorParam, LimitParam, Page, decode_cursor, page_of
from hsp.auth.dependencies import CurrentPrincipal
from hsp.catalog.items import (
    CatalogItemIn,
    CatalogItemOut,
    CatalogItemPatch,
    CatalogService,
    RevisionOut,
    ZoneTypeIn,
    ZoneTypeOut,
    ZoneTypePatch,
)
from hsp.db import get_session

router = APIRouter(tags=["catalog"])


def get_service(
    request: Request, principal: CurrentPrincipal, db: Annotated[AsyncSession, Depends(get_session)]
) -> CatalogService:
    return CatalogService(db, principal, getattr(request.state, "request_id", None))


Service = Annotated[CatalogService, Depends(get_service)]


@router.get("/zone-types")
async def list_zone_types(service: Service) -> Page[ZoneTypeOut]:
    """All zone types (a small list: one page, docs/0040)."""
    return Page[ZoneTypeOut](items=await service.list_zone_types(), next_cursor=None)


@router.post("/zone-types", status_code=201, dependencies=WRITE)
async def create_zone_type(body: ZoneTypeIn, service: Service) -> ZoneTypeOut:
    return await service.create_zone_type(body)


@router.patch("/zone-types/{zone_type_id}", dependencies=WRITE)
async def update_zone_type(
    zone_type_id: uuid.UUID, body: ZoneTypePatch, service: Service
) -> ZoneTypeOut:
    return await service.update_zone_type(zone_type_id, body.model_dump(exclude_unset=True))


@router.delete("/zone-types/{zone_type_id}", status_code=204, dependencies=WRITE)
async def delete_zone_type(zone_type_id: uuid.UUID, service: Service) -> Response:
    """Only when no zone in any floor-plan version uses it (409 in-use)."""
    await service.delete_zone_type(zone_type_id)
    return Response(status_code=204)


@router.get("/catalog-items")
async def list_catalog_items(
    service: Service,
    category: Annotated[str | None, Query()] = None,
    include_archived: Annotated[bool, Query()] = False,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
) -> Page[CatalogItemOut]:
    """Built-in and custom items, each with its current revision."""
    filters = {"category": category, "include_archived": include_archived}
    rows = await service.list_items(
        category=category,
        include_archived=include_archived,
        after=decode_cursor(cursor, filters),
        limit=limit + 1,
    )
    return page_of(rows, limit, filters, lambda r: r)


@router.post("/catalog-items", status_code=201, dependencies=WRITE)
async def create_catalog_item(body: CatalogItemIn, service: Service) -> CatalogItemOut:
    """A custom parametric item (docs/0021), created with revision 1."""
    return await service.create_item(body)


@router.get("/catalog-items/{item_id}")
async def get_catalog_item(item_id: uuid.UUID, service: Service) -> CatalogItemOut:
    return await service.get_item(item_id)


@router.get("/catalog-items/{item_id}/revisions")
async def list_catalog_item_revisions(item_id: uuid.UUID, service: Service) -> Page[RevisionOut]:
    return Page[RevisionOut](items=await service.revisions(item_id), next_cursor=None)


@router.patch("/catalog-items/{item_id}", dependencies=WRITE)
async def update_catalog_item(
    item_id: uuid.UUID, body: CatalogItemPatch, service: Service
) -> CatalogItemOut:
    """Name/category edit the item; shape, dimension and flag changes add a revision, so existing
    placements keep theirs (docs/0021). Built-ins are read-only (409)."""
    return await service.update_item(item_id, body.model_dump(exclude_unset=True))


@router.delete("/catalog-items/{item_id}", status_code=204, dependencies=WRITE)
async def archive_catalog_item(item_id: uuid.UUID, service: Service) -> Response:
    """Archive: hidden from the picker; existing placements are unaffected."""
    await service.archive_item(item_id)
    return Response(status_code=204)


@router.post("/catalog-items/{item_id}/restore", dependencies=WRITE)
async def restore_catalog_item(item_id: uuid.UUID, service: Service) -> CatalogItemOut:
    return await service.restore_item(item_id)
