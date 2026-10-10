"""/api/v1/floors/{id}/lock: exclusive edit lock (docs/0016, docs/0041).

The editor acquires the lock when opening a floor, POSTs again every ~60 s as a heartbeat, and
DELETEs it when done. Everyone can see who is editing.
"""

import uuid
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.api.common import WRITE
from hsp.auth.dependencies import CurrentPrincipal
from hsp.config import Settings, get_settings
from hsp.db import get_session
from hsp.plans.locks import LockRepository, LocksService, LockStatus, SqlLockRepository

router = APIRouter(prefix="/floors/{floor_id}/lock", tags=["edit lock"])


def get_lock_repository(db: Annotated[AsyncSession, Depends(get_session)]) -> LockRepository:
    return SqlLockRepository(db)


def get_service(
    request: Request,
    principal: CurrentPrincipal,
    repo: Annotated[LockRepository, Depends(get_lock_repository)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> LocksService:
    return LocksService(
        repo,
        principal,
        timedelta(seconds=settings.edit_lock_ttl_s),
        getattr(request.state, "request_id", None),
    )


Service = Annotated[LocksService, Depends(get_service)]


@router.get("")
async def lock_status(floor_id: uuid.UUID, service: Service) -> LockStatus:
    """Who is editing this floor, if anyone."""
    return await service.status(floor_id)


@router.post("", dependencies=WRITE)
async def acquire_lock(floor_id: uuid.UUID, service: Service) -> LockStatus:
    """Acquire the lock, or extend your own (heartbeat). 423 if someone else is editing."""
    return await service.acquire(floor_id)


@router.delete("", status_code=204, dependencies=WRITE)
async def release_lock(floor_id: uuid.UUID, service: Service) -> Response:
    """Release your own lock. Idempotent; 409 if someone else holds it."""
    await service.release(floor_id)
    return Response(status_code=204)


@router.post("/force-release", status_code=204, dependencies=WRITE)
async def force_release_lock(floor_id: uuid.UUID, service: Service) -> Response:
    """Admin override: remove whoever's lock. Their draft is kept. Audited."""
    await service.force_release(floor_id)
    return Response(status_code=204)
