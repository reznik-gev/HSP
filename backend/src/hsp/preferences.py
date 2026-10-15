"""The signed-in user's own preferences: language, theme, display units and the editor's grid
size (docs/0046, docs/0047, docs/0087, docs/0092).

Stored per Keycloak subject in `user_profile.preferences` (JSONB), so they follow the user to
any computer. `null` means "not chosen": the app then uses the browser's language, the system
theme, centimetres and a 5 cm grid. Other keys in the JSON are left untouched.
"""

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.auth.principal import Principal


class Preferences(BaseModel):
    language: Literal["en", "he"] | None = None
    theme: Literal["light", "dark", "system"] | None = None
    display_units: Literal["cm", "m", "mm"] | None = None
    grid_mm: Literal[10, 50, 100, 500] | None = None


KEYS = tuple(Preferences.model_fields)


@dataclass
class PreferencesService:
    db: AsyncSession
    principal: Principal

    async def _profile(self) -> models.UserProfile | None:
        return await self.db.scalar(
            select(models.UserProfile).where(
                models.UserProfile.tenant_id == self.principal.tenant_id,
                models.UserProfile.subject == self.principal.subject,
            )
        )

    async def get(self) -> Preferences:
        profile = await self._profile()
        stored = profile.preferences if profile else {}
        return Preferences.model_validate({k: stored.get(k) for k in KEYS})

    async def put(self, body: Preferences) -> Preferences:
        profile = await self._profile()
        if profile is None:
            profile = models.UserProfile(
                tenant_id=self.principal.tenant_id, subject=self.principal.subject, preferences={}
            )
            self.db.add(profile)
        # A new dict, so SQLAlchemy sees the JSONB change.
        profile.preferences = {**(profile.preferences or {}), **body.model_dump()}
        await self.db.commit()
        return body
