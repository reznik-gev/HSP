"""/api/v1/me/preferences: the signed-in user's own settings (docs/0046, docs/0087).

Any signed-in user may read and change their own preferences; writes need the CSRF header.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.auth.dependencies import CurrentPrincipal, require_csrf
from hsp.db import get_session
from hsp.preferences import Preferences, PreferencesService

router = APIRouter(prefix="/me/preferences", tags=["auth"])


def get_service(
    principal: CurrentPrincipal, db: Annotated[AsyncSession, Depends(get_session)]
) -> PreferencesService:
    return PreferencesService(db, principal)


Service = Annotated[PreferencesService, Depends(get_service)]


@router.get("")
async def get_preferences(service: Service) -> Preferences:
    """`null` means not chosen: browser language, system theme, centimetres."""
    return await service.get()


@router.put("", dependencies=[Depends(require_csrf)])
async def put_preferences(body: Preferences, service: Service) -> Preferences:
    """Replace the three preferences (send all of them; `null` clears one)."""
    return await service.put(body)
