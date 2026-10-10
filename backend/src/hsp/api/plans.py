"""Reading floor plans: /api/v1/floors/{id}/versions, /draft and diffs (docs/0036, docs/0080).
Writing (drafts, changesets, publish) comes in later endpoints (docs/0076)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.api.pagination import Page
from hsp.auth.dependencies import CurrentPrincipal
from hsp.db import get_session
from hsp.plans.repository import PlanRepository, SqlPlanRepository
from hsp.plans.schema import FloorVersion, Plan, PlanDiff
from hsp.plans.service import PlansService

router = APIRouter(prefix="/floors/{floor_id}", tags=["floor plans"])

VersionNo = Annotated[int, Path(ge=1)]


def get_plan_repository(db: Annotated[AsyncSession, Depends(get_session)]) -> PlanRepository:
    return SqlPlanRepository(db)


def get_service(
    principal: CurrentPrincipal,
    repo: Annotated[PlanRepository, Depends(get_plan_repository)],
) -> PlansService:
    return PlansService(repo, principal)


Service = Annotated[PlansService, Depends(get_service)]


@router.get("/versions")
async def list_versions(floor_id: uuid.UUID, service: Service) -> Page[FloorVersion]:
    """Version history, oldest first. Viewers see published and superseded versions only.

    Uses the standard list envelope (docs/0040); history is returned in one page for now
    (`next_cursor` is always null), so cursor paging can be added without breaking clients.
    """
    return Page[FloorVersion](items=await service.versions(floor_id), next_cursor=None)


@router.get("/versions/{version}")
async def get_version(floor_id: uuid.UUID, version: VersionNo, service: Service) -> Plan:
    """The complete plan of one version (docs/0036), with the catalog items it uses."""
    return await service.plan(floor_id, version)


@router.get("/versions/{a}/diff/{b}")
async def diff_versions(
    floor_id: uuid.UUID, a: VersionNo, b: VersionNo, service: Service
) -> PlanDiff:
    """What changed from version a to version b: added, removed, and changed fields."""
    return await service.diff(floor_id, a, b)


@router.get("/draft")
async def get_draft(floor_id: uuid.UUID, service: Service) -> Plan:
    """The current draft plan with its revision counter (admins only, docs/0080)."""
    return await service.draft(floor_id)
