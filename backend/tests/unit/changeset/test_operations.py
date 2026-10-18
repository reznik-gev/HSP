"""The changeset engine's operations: add, update, delete, their cascades and effects, and
all-or-nothing application (docs/0081)."""

import pytest

from hsp.models import new_id
from hsp.plans.changeset import ChangesetRejected, DeleteOp, apply_changeset, needed_references
from hsp.plans.schema import PlanContent, Wall, Zone
from tests.unit.changeset.stubs import (
    DESK,
    DEVICE,
    REFS,
    SQUARE,
    ZONE_TYPE,
    add,
    codes,
    delete,
    desk,
    door,
    monitor,
    ops,
    update,
    wall,
)

W1, D1, DOOR1, M1 = new_id(), new_id(), new_id(), new_id()
WALL_AND_DOOR = apply_changeset(
    PlanContent(), ops(add("wall", W1, **wall()), add("opening", DOOR1, **door(W1))), REFS
).content
DESK_AND_MONITOR = apply_changeset(
    PlanContent(), ops(add("object", D1, **desk()), add("object", M1, **monitor(D1))), REFS
).content
#: A plan with a zone and a wall but no objects, for collecting references.
ZONE_AND_WALL = PlanContent(
    zones=[Zone(id=new_id(), name="Z", zone_type_id=ZONE_TYPE, boundary=SQUARE)],
    walls=[Wall(id=new_id(), a=(0, 0), b=(1, 0), thickness_mm=1, height_mm=1)],
)


def test_add_update_delete_and_effects() -> None:
    fx = apply_changeset(
        PlanContent(), ops(add("wall", W1, **wall()), add("object", D1, **desk())), REFS
    )
    assert [x.id for x in fx.content.walls] == [W1]
    assert fx.content.catalog == {str(DESK): REFS.catalog[DESK]}  # only items in use
    assert set(fx.upserted) == {("wall", W1), ("object", D1)}

    moved = apply_changeset(fx.content, ops(update("object", D1, position=(1500, 1000, 0))), REFS)
    assert moved.content.objects[0].position == (1500, 1000, 0)
    assert moved.content.objects[0].allocation_mode == "assigned"  # untouched fields kept

    gone = apply_changeset(moved.content, ops(delete("wall", W1)), REFS)
    assert gone.content.walls == [] and ("wall", W1) in gone.deleted


def test_deleting_a_wall_cascades_to_its_openings() -> None:
    fx = apply_changeset(
        WALL_AND_DOOR,
        # The door is already cascaded with its wall: deleting it too is a no-op, not an error.
        ops(delete("wall", W1), delete("opening", DOOR1)),
        REFS,
    )
    assert fx.content.openings == []
    assert [(c.kind, c.id) for c in fx.cascaded] == [("opening", DOOR1)]


def test_deleting_a_desk_takes_its_monitor() -> None:
    fx = apply_changeset(DESK_AND_MONITOR, ops(delete("object", D1)), REFS)
    assert fx.content.objects == [] and fx.cascaded[0].id == M1


def test_duplicate_and_unknown_ids() -> None:
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            WALL_AND_DOOR,
            ops(
                add("wall", W1, **wall()),
                update("zone", new_id(), name="x"),
                delete("object", new_id()),
            ),
            REFS,
        )
    assert codes(exc) == ["duplicate_id", "unknown_element", "unknown_element"]
    assert [e.op_index for e in exc.value.errors] == [0, 1, 2]


def test_all_or_nothing_reports_every_problem() -> None:
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            PlanContent(),
            ops(
                add("wall", new_id(), **wall()),
                add("wall", new_id(), **wall(a=(1, 1), b=(1, 1))),
                add("object", new_id(), **desk(allocation_mode=None)),
            ),
            REFS,
        )
    assert len(exc.value.errors) == 2  # nothing is applied when anything fails


def test_needed_references_collects_ids_from_content_and_ops() -> None:
    catalog, zone_types, devices = needed_references(
        ZONE_AND_WALL, ops(add("object", new_id(), **desk(device_id=DEVICE)))
    )
    assert (catalog, zone_types, devices) == ({DESK}, {ZONE_TYPE}, {DEVICE})


def test_op_parsing_rejects_unknown_kinds() -> None:
    with pytest.raises(ValueError):
        ops(add("staircase", new_id()))
    assert isinstance(ops(delete("wall", new_id()))[0], DeleteOp)
