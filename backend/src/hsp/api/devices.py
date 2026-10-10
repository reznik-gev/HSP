"""/api/v1/devices (docs/0022, docs/0083)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.api.common import WRITE
from hsp.api.pagination import DEFAULT_LIMIT, CursorParam, LimitParam, Page, decode_cursor, page_of
from hsp.auth.dependencies import CurrentPrincipal
from hsp.catalog.devices import DeviceIn, DeviceOut, DevicePatch, DevicesService
from hsp.db import get_session

router = APIRouter(prefix="/devices", tags=["devices"])


def get_service(
    request: Request, principal: CurrentPrincipal, db: Annotated[AsyncSession, Depends(get_session)]
) -> DevicesService:
    return DevicesService(db, principal, getattr(request.state, "request_id", None))


Service = Annotated[DevicesService, Depends(get_service)]


@router.get("")
async def list_devices(
    service: Service,
    q: Annotated[str | None, Query(description="Search asset tag or serial number")] = None,
    assigned_person_id: Annotated[uuid.UUID | None, Query()] = None,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
) -> Page[DeviceOut]:
    """Devices with their current placement ("where is MON-0412?")."""
    filters = {"q": q, "assigned_person_id": assigned_person_id}
    rows = await service.list(
        q=q,
        assigned_person_id=assigned_person_id,
        after=decode_cursor(cursor, filters),
        limit=limit + 1,
    )
    return page_of(rows, limit, filters, lambda r: r)


@router.post("", status_code=201, dependencies=WRITE)
async def create_device(body: DeviceIn, service: Service) -> DeviceOut:
    return await service.create(body)


@router.get("/{device_id}")
async def get_device(device_id: uuid.UUID, service: Service) -> DeviceOut:
    return await service.get(device_id)


@router.patch("/{device_id}", dependencies=WRITE)
async def update_device(device_id: uuid.UUID, body: DevicePatch, service: Service) -> DeviceOut:
    return await service.update(device_id, body.model_dump(exclude_unset=True))


@router.delete("/{device_id}", status_code=204, dependencies=WRITE)
async def delete_device(device_id: uuid.UUID, service: Service) -> Response:
    """Only for devices never placed in any floor-plan version (409 in-use)."""
    await service.delete(device_id)
    return Response(status_code=204)
