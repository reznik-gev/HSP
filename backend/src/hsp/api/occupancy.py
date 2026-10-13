"""/api/v1/occupancy: seat counts per floor, building, site and unit (docs/0025, docs/0085)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.auth.dependencies import CurrentPrincipal
from hsp.db import get_session
from hsp.seats.occupancy import (
    BuildingOccupancy,
    FloorOccupancy,
    OccupancyService,
    SiteOccupancy,
    UnitOccupancy,
)

router = APIRouter(prefix="/occupancy", tags=["seats"])


def get_service(
    principal: CurrentPrincipal, db: Annotated[AsyncSession, Depends(get_session)]
) -> OccupancyService:
    return OccupancyService(db, principal)


Service = Annotated[OccupancyService, Depends(get_service)]


@router.get("/sites/{site_id}")
async def site_occupancy(site_id: uuid.UUID, service: Service) -> SiteOccupancy:
    """Totals for the site, per active building and per active floor."""
    return await service.site(site_id)


@router.get("/buildings/{building_id}")
async def building_occupancy(building_id: uuid.UUID, service: Service) -> BuildingOccupancy:
    return await service.building(building_id)


@router.get("/floors/{floor_id}")
async def floor_occupancy(floor_id: uuid.UUID, service: Service) -> FloorOccupancy:
    return await service.floor(floor_id)


@router.get("/units/{unit_id}")
async def unit_occupancy(
    unit_id: uuid.UUID,
    service: Service,
    include_sub_units: Annotated[bool, Query()] = False,
) -> UnitOccupancy:
    """Seats reserved for the unit and seats held by its active members."""
    return await service.unit(unit_id, include_sub_units)
