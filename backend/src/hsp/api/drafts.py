"""Writing floor plans: /api/v1/floors/{id}/draft and /draft/changesets (docs/0036, docs/0081).

Needs hsp-admin, the CSRF token and the floor's edit lock (docs/0016).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.api.common import WRITE
from hsp.api.plans import Service as PlansServiceDep
from hsp.auth.dependencies import CurrentPrincipal
from hsp.db import get_session
from hsp.plans.changeset import ChangesetIn
from hsp.plans.drafts import ChangesetResult, DraftRepository, DraftsService, SqlDraftRepository
from hsp.plans.publishing import (
    PublishIn,
    PublishingService,
    PublishRepository,
    PublishResult,
    SqlPublishRepository,
)
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


def get_publish_repository(db: Annotated[AsyncSession, Depends(get_session)]) -> PublishRepository:
    return SqlPublishRepository(db)


def get_publishing(
    request: Request,
    principal: CurrentPrincipal,
    drafts: Annotated[DraftRepository, Depends(get_draft_repository)],
    repo: Annotated[PublishRepository, Depends(get_publish_repository)],
) -> PublishingService:
    return PublishingService(drafts, repo, principal, getattr(request.state, "request_id", None))


Publishing = Annotated[PublishingService, Depends(get_publishing)]


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


@router.post("/publish", dependencies=WRITE)
async def publish_draft(
    floor_id: uuid.UUID, body: PublishIn, publishing: Publishing
) -> PublishResult:
    """Make the draft the published version (docs/0082). `base_revision` must be the revision
    you reviewed. 409 publish-conflicts lists seat-label, device and assignment problems."""
    return await publishing.publish(floor_id, body)


@router.delete("", status_code=204, dependencies=WRITE)
async def discard_draft(floor_id: uuid.UUID, publishing: Publishing) -> Response:
    """Throw the draft away (docs/0028, 0081). Idempotent."""
    await publishing.discard(floor_id)
    return Response(status_code=204)


@router.post("/restore/{version}", status_code=201, dependencies=WRITE)
async def restore_version(
    floor_id: uuid.UUID,
    version: Annotated[int, Path(ge=1)],
    publishing: Publishing,
    plans: PlansServiceDep,
) -> Plan:
    """Start a draft whose content is exactly an older published version (docs/0082)."""
    await publishing.restore(floor_id, version)
    return await plans.draft(floor_id)
