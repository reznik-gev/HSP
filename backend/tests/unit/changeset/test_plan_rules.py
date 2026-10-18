"""The changeset engine's plan rules: openings fit their walls, references exist, mounting,
seats and devices, and zone nesting (docs/0081)."""

import pytest

from hsp.models import new_id
from hsp.plans.changeset import ChangesetRejected, apply_changeset
from hsp.plans.schema import PlanContent
from tests.stubs import stub_placed_object
from tests.unit.changeset.stubs import (
    DEVICE,
    REFS,
    add,
    chair,
    codes,
    delete,
    desk,
    door,
    monitor,
    ops,
    update,
    wall,
    zone,
)

W1, DOOR1, CHAIR1 = new_id(), new_id(), new_id()
PARENT, CHILD = new_id(), new_id()
#: An id that no element, catalog item, zone type or device has.
UNKNOWN = new_id()
#: A door from 4.5 to 5.4 m along its wall.
LATE_DOOR = door(W1, offset_mm=4500)
DOOR_ON_8M_WALL = apply_changeset(
    PlanContent(),
    ops(add("wall", W1, **wall(b=(8000, 0))), add("opening", DOOR1, **LATE_DOOR)),
    REFS,
).content
WING_WITH_POD = apply_changeset(
    PlanContent(),
    ops(
        add("zone", PARENT, **zone("Wing")),
        add("zone", CHILD, **zone("Pod", parent_zone_id=PARENT)),
    ),
    REFS,
).content
#: A stored plan with an object of a catalog item that no longer exists.
WITH_LEGACY_PROBLEM = PlanContent(objects=[stub_placed_object(UNKNOWN)])


def test_opening_must_fit_its_wall_including_when_the_wall_shrinks() -> None:
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            PlanContent(), ops(add("wall", W1, **wall()), add("opening", DOOR1, **LATE_DOOR)), REFS
        )
    assert codes(exc) == ["opening_exceeds_wall"]
    assert "400 mm past the wall end" in exc.value.errors[0].message

    with pytest.raises(ChangesetRejected) as exc:  # shortening the wall strands the untouched door
        apply_changeset(DOOR_ON_8M_WALL, ops(update("wall", W1, b=(5000, 0))), REFS)
    [problem] = exc.value.errors
    assert (problem.code, problem.element_id, problem.op_index) == (
        "opening_exceeds_wall",
        str(DOOR1),
        0,
    )


def test_missing_references() -> None:
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            PlanContent(),
            ops(
                add("opening", new_id(), **door(UNKNOWN, type="window", height_mm=1200)),
                add("zone", new_id(), **zone(zone_type_id=UNKNOWN)),
                add("object", new_id(), **chair(catalog_item_rev_id=UNKNOWN)),
                add("object", new_id(), **desk(device_id=UNKNOWN)),
                add("object", new_id(), **monitor(UNKNOWN)),
            ),
            REFS,
        )
    assert codes(exc) == ["reference_missing"] * 5


def test_mountable_and_allocation_rules() -> None:
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            PlanContent(),
            ops(
                add("object", new_id(), **desk(position=(0, 0, 700))),  # desk off the floor
                add("object", new_id(), **desk(allocation_mode=None)),  # seat without mode
                add("object", new_id(), **chair(allocation_mode="bookable")),
            ),
            REFS,
        )
    assert sorted(codes(exc)) == [
        "allocation_mode_not_seat",
        "allocation_mode_required",
        "not_mountable",
    ]


def test_attach_rules_and_device_once() -> None:
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            PlanContent(),
            ops(
                add("object", CHAIR1, **chair()),
                add("object", new_id(), **monitor(CHAIR1)),
                add("object", new_id(), **desk(device_id=DEVICE)),
                add("object", new_id(), **desk(device_id=DEVICE)),
            ),
            REFS,
        )
    assert sorted(codes(exc)) == ["attach_not_allowed", "device_placed_twice"]


def test_zone_children_and_cycles() -> None:
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(WING_WITH_POD, ops(delete("zone", PARENT)), REFS)
    assert codes(exc) == ["zone_has_children"] and exc.value.errors[0].op_index == 0
    # Deleting the children in the same changeset is fine.
    ok = apply_changeset(WING_WITH_POD, ops(delete("zone", CHILD), delete("zone", PARENT)), REFS)
    assert ok.content.zones == []
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(WING_WITH_POD, ops(update("zone", PARENT, parent_zone_id=CHILD)), REFS)
    assert "zone_cycle" in codes(exc)


def test_untouched_legacy_problem_does_not_block_saves() -> None:
    fx = apply_changeset(WITH_LEGACY_PROBLEM, ops(add("wall", new_id(), **wall())), REFS)
    assert len(fx.content.walls) == 1  # an unrelated edit
