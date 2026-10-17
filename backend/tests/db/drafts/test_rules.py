"""The plan rules as a saved changeset meets them (docs/0081, docs/0092): a refused changeset saves
nothing, overlapping zones and zones sticking out of their parent are refused, and warnings come
back about what a change touched."""

from typing import Any

import pytest

from hsp import models
from hsp.models import new_id
from hsp.problems import ProblemException
from tests.db.plan_helpers import add, apply, stub_desk, stub_door, stub_wall, stub_zone

#: A zone outline moved 2 m east of stub_zone's.
MOVED_2_M = {"boundary": [[2000, 0], [6000, 0], [6000, 3000], [2000, 3000]]}


async def test_an_invalid_changeset_saves_nothing(admin_editing_new_floor: dict[str, Any]) -> None:
    w = new_id()
    with pytest.raises(ProblemException) as exc:
        await apply(
            admin_editing_new_floor,
            0,
            add("wall", w, **stub_wall()),
            add("opening", new_id(), **stub_door(w, offset_mm=5500)),  # past the wall's end
        )
    assert (exc.value.status, exc.value.slug) == (422, "changeset-invalid")
    assert exc.value.errors is not None and exc.value.errors[0].code == "opening_exceeds_wall"
    await admin_editing_new_floor[
        "db"
    ].rollback()  # what the request's session does when the handler raises
    assert await admin_editing_new_floor["db"].get(models.FloorElement, w) is None


async def test_zones_overlapping_partly_are_refused(
    admin_editing_new_floor: dict[str, Any],
) -> None:
    await apply(  # sharing an edge is fine
        admin_editing_new_floor,
        0,
        add("zone", new_id(), **stub_zone(admin_editing_new_floor)),
        add("zone", new_id(), **stub_zone(admin_editing_new_floor, x=4000)),
    )
    with pytest.raises(ProblemException) as exc:
        await apply(
            admin_editing_new_floor,
            1,
            add("zone", new_id(), **stub_zone(admin_editing_new_floor, x=2000)),
        )
    assert exc.value.errors is not None
    assert {e.code for e in exc.value.errors} == {"zone_overlap"}


async def test_moving_a_parent_off_its_nested_zone_is_refused(
    admin_editing_new_floor: dict[str, Any],
) -> None:
    parent, child = new_id(), new_id()
    await apply(  # a child exactly as big as its parent is inside it
        admin_editing_new_floor,
        0,
        add("zone", parent, **stub_zone(admin_editing_new_floor, name="Wing")),
        add(
            "zone",
            child,
            **stub_zone(admin_editing_new_floor, name="Pod", parent_zone_id=str(parent)),
        ),
    )
    with pytest.raises(ProblemException) as exc:
        await apply(
            admin_editing_new_floor,
            1,
            {"op": "update", "kind": "zone", "id": str(parent), "data": MOVED_2_M},
        )
    assert exc.value.errors is not None
    assert [(e.code, e.element_id) for e in exc.value.errors] == [
        ("zone_outside_parent", str(child))
    ]


async def test_changesets_warn_about_what_they_touch(
    admin_editing_new_floor: dict[str, Any],
) -> None:
    unlabelled = new_id()
    r = await apply(
        admin_editing_new_floor,
        0,
        add("object", unlabelled, **stub_desk(admin_editing_new_floor, label=None)),
    )
    assert [(w["code"], w["element_id"]) for w in r.warnings] == [
        ("seat_without_label", str(unlabelled))
    ]
    # Another change doesn't repeat warnings about elements it leaves alone.
    r = await apply(
        admin_editing_new_floor,
        1,
        add("object", new_id(), **stub_desk(admin_editing_new_floor, x=4000)),
    )
    assert r.warnings == []
