"""Dependencies shared by the /api/v1 routers."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from musical_chairs.auth.dependencies import require_admin, require_csrf
from musical_chairs.db import get_session
from musical_chairs.locations.repository import LocationsRepository, SqlLocationsRepository

#: Dependencies for state-changing endpoints: CSRF token + musical-chairs-admin (docs/0027,
#: docs/0038).
WRITE = [Depends(require_csrf), Depends(require_admin)]


def get_locations_repository(
    db: Annotated[AsyncSession, Depends(get_session)],
) -> LocationsRepository:
    return SqlLocationsRepository(db)
