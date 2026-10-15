"""Who may apply a changeset, and when (docs/0081): the right revision and the floor's lock."""

from typing import Any

import pytest
from sqlalchemy import text

from hsp.auth.principal import Principal
from hsp.models import new_id
from hsp.problems import ProblemException
from tests.db.plan_helpers import add, apply, stub_wall


async def test_a_stale_revision_is_refused(ctx: dict[str, Any]) -> None:
    await apply(ctx, 0, add("wall", new_id(), **stub_wall()))
    with pytest.raises(ProblemException) as exc:
        await apply(ctx, 0, add("wall", new_id(), **stub_wall()))  # the draft is at revision 1
    assert (exc.value.status, exc.value.slug) == (409, "stale-revision")


async def test_someone_else_holding_the_lock_is_refused(
    ctx: dict[str, Any], other_admin: Principal
) -> None:
    with pytest.raises(ProblemException) as exc:
        await apply(ctx, 0, add("wall", new_id(), **stub_wall()), who=other_admin)
    assert (exc.value.status, exc.value.slug) == (423, "floor-locked")


async def test_editing_without_the_lock_is_refused(ctx: dict[str, Any]) -> None:
    await ctx["db"].execute(
        text("DELETE FROM floor_edit_lock WHERE floor_id = :f"), {"f": ctx["floor"]}
    )
    with pytest.raises(ProblemException) as exc:
        await apply(ctx, 0, add("wall", new_id(), **stub_wall()))
    assert (exc.value.status, exc.value.slug) == (409, "lock-required")
