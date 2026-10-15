"""The plan rules as a saved changeset meets them (docs/0081, docs/0092): a refused changeset saves
nothing, overlapping zones are refused, and warnings come back about what a change touched."""

from typing import Any

import pytest

from hsp import models
from hsp.models import new_id
from hsp.problems import ProblemException
from tests.db.plan_helpers import add, apply, stub_desk, stub_door, stub_wall, stub_zone


async def test_an_invalid_changeset_saves_nothing(ctx: dict[str, Any]) -> None:
    w = new_id()
    with pytest.raises(ProblemException) as exc:
        await apply(
            ctx,
            0,
            add("wall", w, **stub_wall()),
            add("opening", new_id(), **stub_door(w, offset_mm=5500)),  # past the wall's end
        )
    assert (exc.value.status, exc.value.slug) == (422, "changeset-invalid")
    assert exc.value.errors is not None and exc.value.errors[0].code == "opening_exceeds_wall"
    await ctx["db"].rollback()  # what the request's session does when the handler raises
    assert await ctx["db"].get(models.FloorElement, w) is None


async def test_zones_overlapping_partly_are_refused(ctx: dict[str, Any]) -> None:
    await apply(  # sharing an edge is fine
        ctx,
        0,
        add("zone", new_id(), **stub_zone(ctx)),
        add("zone", new_id(), **stub_zone(ctx, x=4000)),
    )
    with pytest.raises(ProblemException) as exc:
        await apply(ctx, 1, add("zone", new_id(), **stub_zone(ctx, x=2000)))
    assert exc.value.errors is not None
    assert {e.code for e in exc.value.errors} == {"zone_overlap"}


async def test_changesets_warn_about_what_they_touch(ctx: dict[str, Any]) -> None:
    unlabelled = new_id()
    r = await apply(ctx, 0, add("object", unlabelled, **stub_desk(ctx, label=None)))
    assert [(w["code"], w["element_id"]) for w in r.warnings] == [
        ("seat_without_label", str(unlabelled))
    ]
    # Another change doesn't repeat warnings about elements it leaves alone.
    r = await apply(ctx, 1, add("object", new_id(), **stub_desk(ctx, x=4000)))
    assert r.warnings == []
