"""Writing floor plans: /api/v1/floors/{id}/draft and /draft/changesets (docs/0036, docs/0081).

Needs hsp-admin, the CSRF token and the floor's edit lock (docs/0016).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.api.common import WRITE
from hsp.api.plans import Service as PlansServiceDep
from hsp.auth.dependencies import CurrentPrincipal
from hsp.db import get_session
from hsp.plans.changeset import ChangesetIn
from hsp.plans.drafts import ChangesetResult, DraftRepository, DraftsService, SqlDraftRepository
from hsp.plans.schema import Plan

router = APIRouter(prefix="/floors/{floor_id}/draft", tags=["floor plans"])


def get_draft_repository(db: Annotated[AsyncSession, Depends(get_session)]) -> DraftRepository:
    return SqlDraftRepository(db)


def get_service(
    request: Request,
    principal: CurrentPrincipal,
    repo: Annotated[DraftRepository, Depends(get_draft_repository)],
) -> DraftsService:
    return DraftsService(repo, principal, getattr(request.state, "request_id", None))


Service = Annotated[DraftsService, Depends(get_service)]


@router.post("", status_code=201, dependencies=WRITE)
async def create_draft(floor_id: uuid.UUID, service: Service, plans: PlansServiceDep) -> Plan:
    """Start a draft explicitly. Usually unnecessary: the first changeset starts one (docs/0081)."""
    await service.create_draft(floor_id)
    return await plans.draft(floor_id)


@router.post("/changesets", dependencies=WRITE)
async def apply_changeset(
    floor_id: uuid.UUID, body: ChangesetIn, service: Service
) -> ChangesetResult:
    """Apply a batch of add/update/delete operations to the draft, all or nothing.

    409 stale-revision if `base_revision` is outdated, 409 lock-required / 423 floor-locked
    without the edit lock, 422 changeset-invalid with per-operation errors.
    """
    return await service.apply(floor_id, body)
