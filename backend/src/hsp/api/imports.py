"""/api/v1/imports: CSV/Excel import of org units and people (docs/0027, docs/0084).

Dry run by default; resend the same file with `?apply=true` to commit.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.api.common import WRITE
from hsp.auth.dependencies import CurrentPrincipal
from hsp.db import get_session
from hsp.org.imports import ImportReport, ImportService, read_table
from hsp.problems import ProblemException

router = APIRouter(prefix="/imports", tags=["organization"])

MAX_BYTES = 10 * 1024 * 1024
Apply = Annotated[bool, Query(description="false = dry run (report only); true = commit")]


def get_service(
    request: Request, principal: CurrentPrincipal, db: Annotated[AsyncSession, Depends(get_session)]
) -> ImportService:
    return ImportService(db, principal, getattr(request.state, "request_id", None))


Service = Annotated[ImportService, Depends(get_service)]


async def _rows(file: UploadFile) -> list[dict[str, str | None]]:
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ProblemException(
            413, "import-too-large", "File too large", "Imports are limited to 10 MB."
        )
    return read_table(file.filename or "", data)


@router.post("/units", dependencies=WRITE)
async def import_units(file: UploadFile, service: Service, apply: Apply = False) -> ImportReport:
    """Columns: external_id*, name*, parent_external_id, level_label (docs/0084)."""
    return await service.import_units(await _rows(file), apply)


@router.post("/people", dependencies=WRITE)
async def import_people(file: UploadFile, service: Service, apply: Apply = False) -> ImportReport:
    """Columns: email*, display_name*, external_id, title, primary_unit_external_id,
    secondary_unit_external_ids (';'-separated), position (docs/0084)."""
    return await service.import_people(await _rows(file), apply)
