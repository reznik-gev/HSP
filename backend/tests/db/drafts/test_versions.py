"""Drafts as versions of a floor (docs/0028). The key property: editing in a new draft never
changes a published version."""

import uuid
from typing import Any

import pytest
from sqlalchemy import func, select

from hsp import models
from hsp.models import new_id
from hsp.problems import ProblemException
from tests.db.plan_helpers import (
    add,
    apply,
    plan,
    publish_by_hand,
    stub_desk,
    stub_door,
    stub_wall,
    stub_zone,
)


async def revisions(ctx: dict[str, Any], model: Any, element_id: uuid.UUID) -> int:
    """How many revision rows an element has in `model`'s table."""
    return int(
        await ctx["db"].scalar(
            select(func.count()).select_from(model).where(model.element_id == element_id)
        )
    )


async def test_first_changeset_creates_the_draft_and_saves_everything(ctx: dict[str, Any]) -> None:
    w, door, desk, zone = new_id(), new_id(), new_id(), new_id()
    result = await apply(
        ctx,
        0,
        add("wall", w, **stub_wall()),
        add("opening", door, **stub_door(w)),  # wall and door in one go (FK order)
        add("object", desk, **stub_desk(ctx)),
        add("zone", zone, **stub_zone(ctx, name="Pod A")),
    )
    assert (result.version, result.revision) == (1, 1)  # never-published floor: draft is v1

    v1 = await plan(ctx, 1)
    assert [x.id for x in v1.walls] == [w]
    assert v1.openings[0].wall_id == w
    assert v1.objects[0].position == (1000, 1000, 0)
    assert v1.zones[0].name == "Pod A"
    actions = (
        await ctx["db"].scalars(
            select(models.AuditEvent.action).where(models.AuditEvent.entity_id == ctx["floor"])
        )
    ).all()
    assert "floor.draft_created" in actions


async def test_edits_within_a_draft_update_in_place(ctx: dict[str, Any]) -> None:
    desk = new_id()
    await apply(ctx, 0, add("object", desk, **stub_desk(ctx)))
    r = await apply(
        ctx,
        1,
        {"op": "update", "kind": "object", "id": str(desk), "data": {"position": [2500, 1000, 0]}},
    )
    assert r.revision == 2
    assert await revisions(ctx, models.ObjectRev, desk) == 1  # same draft: no new revision row
    assert (await plan(ctx, 1)).objects[0].position == (2500, 1000, 0)


async def test_editing_a_new_draft_never_changes_the_published_version(ctx: dict[str, Any]) -> None:
    w, door, desk, new_desk = new_id(), new_id(), new_id(), new_id()
    await apply(
        ctx,
        0,
        add("wall", w, **stub_wall()),
        add("opening", door, **stub_door(w)),
        add("object", desk, **stub_desk(ctx)),
    )
    await publish_by_hand(ctx)

    result = await apply(
        ctx,
        0,  # no draft any more: the next changeset starts draft v2
        {"op": "update", "kind": "object", "id": str(desk), "data": {"position": [3000, 1000, 0]}},
        {"op": "delete", "kind": "wall", "id": str(w)},
        add("object", new_desk, **stub_desk(ctx, x=5000)),
    )
    assert (result.version, result.revision) == (2, 1)
    assert result.cascaded == [{"kind": "opening", "id": str(door)}]

    v1, v2 = await plan(ctx, 1), await plan(ctx, 2)
    assert (len(v1.walls), len(v1.openings), v1.objects[0].position) == (1, 1, (1000, 1000, 0))
    assert (len(v2.walls), len(v2.openings)) == (0, 0)
    assert {o.id: o.position for o in v2.objects} == {
        desk: (3000, 1000, 0),
        new_desk: (5000, 1000, 0),
    }
    # The desk's v1 revision was closed at 2 and a v2 one opened; the wall's was closed, not
    # deleted, because v1 still needs it.
    assert await revisions(ctx, models.ObjectRev, desk) == 2
    assert await revisions(ctx, models.WallRev, w) == 1


async def test_added_then_deleted_in_the_same_draft_leaves_no_trace(ctx: dict[str, Any]) -> None:
    w = new_id()
    await apply(ctx, 0, add("wall", w, **stub_wall()))
    await apply(ctx, 1, {"op": "delete", "kind": "wall", "id": str(w)})
    assert await ctx["db"].get(models.FloorElement, w) is None


async def test_ids_are_never_reused(ctx: dict[str, Any]) -> None:
    """An element deleted in a new draft still exists in the published version, so its id is
    permanent: re-adding it is refused (docs/0028)."""
    w = new_id()
    await apply(ctx, 0, add("wall", w, **stub_wall()))
    await publish_by_hand(ctx)
    await apply(ctx, 0, {"op": "delete", "kind": "wall", "id": str(w)})  # draft v2

    with pytest.raises(ProblemException) as exc:
        await apply(ctx, 1, add("wall", w, **stub_wall()))
    assert exc.value.errors is not None
    assert (exc.value.errors[0].code, exc.value.errors[0].op_index) == ("duplicate_id", 0)
