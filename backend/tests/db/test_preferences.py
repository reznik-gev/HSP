"""Per-user preferences against PostgreSQL (docs/0046, docs/0087)."""

from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.auth.principal import Principal
from hsp.models import new_id
from hsp.preferences import Preferences, PreferencesService
from tests.db.plan_helpers import new_tenant


@pytest.fixture
async def users(db: AsyncSession) -> dict[str, Any]:
    """A tenant of its own, and `as_user(subject)` for the preferences of any user in it."""
    tenant = await new_tenant(db)

    def as_user(subject: str) -> PreferencesService:
        return PreferencesService(
            db, Principal(subject, subject, None, frozenset(), tenant, new_id(), "c")
        )

    return {"db": db, "as_user": as_user, "tenant": tenant}


async def test_defaults_then_saved_per_user(users: dict[str, Any]) -> None:
    noa, eli = users["as_user"]("noa"), users["as_user"]("eli")
    assert await noa.get() == Preferences()  # nothing chosen yet
    await noa.put(Preferences(language="he", theme="dark", display_units="m", grid_mm=100))
    assert await noa.get() == Preferences(
        language="he", theme="dark", display_units="m", grid_mm=100
    )
    assert await eli.get() == Preferences()  # each user has their own

    await noa.put(Preferences(language="en"))  # null clears the others
    assert await noa.get() == Preferences(language="en")


async def test_other_keys_in_the_profile_are_kept(users: dict[str, Any]) -> None:
    users["db"].add(
        models.UserProfile(tenant_id=users["tenant"], subject="noa", preferences={"future_key": 1})
    )
    await users["db"].flush()
    await users["as_user"]("noa").put(Preferences(theme="light"))
    profile = await users["db"].scalar(
        select(models.UserProfile).where(models.UserProfile.subject == "noa")
    )
    assert profile is not None and profile.preferences["future_key"] == 1


def test_unknown_values_are_refused() -> None:
    with pytest.raises(ValidationError):
        Preferences.model_validate({"language": "fr"})
    with pytest.raises(ValidationError):
        Preferences.model_validate({"grid_mm": 70})  # 1, 5, 10 or 50 cm only (docs/0047)
