"""The changeset engine: operations, cascades and every core rule of docs/0081."""

import uuid
from typing import Any

import pytest
from pydantic import TypeAdapter

from hsp.models import new_id
from hsp.plans.changeset import (
    AddOp,
    ChangesetRejected,
    DeleteOp,
    Op,
    References,
    UpdateOp,
    apply_changeset,
    needed_references,
)
from hsp.plans.schema import CatalogItem, PlacedObject, PlanContent, Wall, Zone

DESK, CHAIR, MONITOR = new_id(), new_id(), new_id()
ZONE_TYPE, DEVICE = new_id(), new_id()


def item(
    rev: uuid.UUID,
    key: str,
    category: str,
    *,
    seat: bool = False,
    mountable: bool = False,
    attaches: list[str] | None = None,
) -> CatalogItem:
    return CatalogItem(
        id=rev,
        item_id=new_id(),
        key=key,
        category=category,
        name=key.title(),
        shape="box",
        width_mm=600,
        depth_mm=600,
        height_mm=700,
        color=None,
        is_seat=seat,
        mountable=mountable,
        attaches_to_categories=attaches or [],
        footprint_blocks=True,
    )


REFS = References(
    catalog={
        DESK: item(DESK, "desk", "desk", seat=True),
        CHAIR: item(CHAIR, "chair", "chair"),
        MONITOR: item(MONITOR, "monitor", "monitor", mountable=True, attaches=["desk"]),
    },
    zone_type_ids=frozenset({ZONE_TYPE}),
    device_ids=frozenset({DEVICE}),
)
ops_adapter = TypeAdapter(list[Op])


def ops(*raw: dict[str, Any]) -> list[AddOp | UpdateOp | DeleteOp]:
    return ops_adapter.validate_python(list(raw))


def add(kind: str, element_id: uuid.UUID, **data: Any) -> dict[str, Any]:
    return {"op": "add", "kind": kind, "id": element_id, "data": data}


def wall(a: tuple[int, int] = (0, 0), b: tuple[int, int] = (5000, 0)) -> dict[str, Any]:
    return {"a": a, "b": b, "thickness_mm": 150, "height_mm": 2800}


def desk(**over: Any) -> dict[str, Any]:
    return {
        "catalog_item_rev_id": DESK,
        "position": (1000, 1000, 0),
        "allocation_mode": "assigned",
        **over,
    }


def codes(exc: pytest.ExceptionInfo[ChangesetRejected]) -> list[str]:
    return [e.code for e in exc.value.errors]


def test_add_update_delete_and_effects() -> None:
    w, d = new_id(), new_id()
    fx = apply_changeset(
        PlanContent(), ops(add("wall", w, **wall()), add("object", d, **desk())), REFS
    )
    assert [x.id for x in fx.content.walls] == [w]
    assert fx.content.catalog == {str(DESK): REFS.catalog[DESK]}  # only items in use
    assert set(fx.upserted) == {("wall", w), ("object", d)}

    moved = apply_changeset(
        fx.content,
        ops({"op": "update", "kind": "object", "id": d, "data": {"position": (1500, 1000, 0)}}),
        REFS,
    )
    assert moved.content.objects[0].position == (1500, 1000, 0)
    assert moved.content.objects[0].allocation_mode == "assigned"  # untouched fields kept

    gone = apply_changeset(moved.content, ops({"op": "delete", "kind": "wall", "id": w}), REFS)
    assert gone.content.walls == [] and ("wall", w) in gone.deleted


def test_deleting_a_wall_cascades_to_its_openings() -> None:
    w, door = new_id(), new_id()
    base = apply_changeset(
        PlanContent(),
        ops(
            add("wall", w, **wall()),
            add(
                "opening",
                door,
                wall_id=w,
                type="door",
                offset_mm=1000,
                width_mm=900,
                height_mm=2100,
                swing="left_in",
            ),
        ),
        REFS,
    ).content
    fx = apply_changeset(
        base,
        ops(
            {"op": "delete", "kind": "wall", "id": w},
            {
                "op": "delete",
                "kind": "opening",
                "id": door,
            },  # already cascaded: a no-op, not an error
        ),
        REFS,
    )
    assert fx.content.openings == []
    assert [(c.kind, c.id) for c in fx.cascaded] == [("opening", door)]


def test_deleting_a_desk_takes_its_monitor() -> None:
    d, m = new_id(), new_id()
    base = apply_changeset(
        PlanContent(),
        ops(
            add("object", d, **desk()),
            add(
                "object", m, catalog_item_rev_id=MONITOR, position=(1000, 1100, 740), attached_to=d
            ),
        ),
        REFS,
    ).content
    fx = apply_changeset(base, ops({"op": "delete", "kind": "object", "id": d}), REFS)
    assert fx.content.objects == [] and fx.cascaded[0].id == m


def test_duplicate_and_unknown_ids() -> None:
    w = new_id()
    base = apply_changeset(PlanContent(), ops(add("wall", w, **wall())), REFS).content
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            base,
            ops(
                add("wall", w, **wall()),
                {"op": "update", "kind": "zone", "id": new_id(), "data": {"name": "x"}},
                {"op": "delete", "kind": "object", "id": new_id()},
            ),
            REFS,
        )
    assert codes(exc) == ["duplicate_id", "unknown_element", "unknown_element"]
    assert [e.op_index for e in exc.value.errors] == [0, 1, 2]


@pytest.mark.parametrize(
    ("data", "pointer"),
    [
        ({**wall(), "thickness_mm": 0}, "/ops/0/data/thickness_mm"),
        ({**wall(), "a": (0.5, 0)}, "/ops/0/data/a/0"),  # whole millimetres only
        ({**wall(), "a": (99_000_000, 0)}, "/ops/0/data/a/0"),  # out of bounds
    ],
)
def test_field_validation_points_at_the_field(data: dict[str, Any], pointer: str) -> None:
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(PlanContent(), ops(add("wall", new_id(), **data)), REFS)
    assert exc.value.errors[0].code == "invalid_field"
    assert exc.value.errors[0].pointer == pointer


def test_rotation_range() -> None:
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            PlanContent(), ops(add("object", new_id(), **desk(rotation_ddeg=3600))), REFS
        )
    assert codes(exc) == ["invalid_field"]


def test_degenerate_wall_and_invalid_polygons() -> None:
    bowtie = [(0, 0), (1000, 1000), (1000, 0), (0, 1000)]  # self-intersecting
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            PlanContent(),
            ops(
                add("wall", new_id(), **wall(a=(10, 10), b=(10, 10))),
                add("zone", new_id(), name="Z", zone_type_id=ZONE_TYPE, boundary=bowtie),
                add("column", new_id(), footprint=[(0, 0), (100, 0)], height_mm=2800),
            ),
            REFS,
        )
    assert sorted(codes(exc)) == ["polygon_invalid", "polygon_invalid", "wall_degenerate"]


def test_opening_must_fit_its_wall_including_when_the_wall_shrinks() -> None:
    w, door = new_id(), new_id()
    door_data = dict(
        wall_id=w, type="door", offset_mm=4500, width_mm=900, height_mm=2100, swing="none"
    )
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            PlanContent(), ops(add("wall", w, **wall()), add("opening", door, **door_data)), REFS
        )
    assert codes(exc) == ["opening_exceeds_wall"]
    assert "400 mm past the wall end" in exc.value.errors[0].message

    base = apply_changeset(
        PlanContent(),
        ops(add("wall", w, **wall(b=(8000, 0))), add("opening", door, **door_data)),
        REFS,
    ).content
    with pytest.raises(ChangesetRejected) as exc:  # shortening the wall strands the untouched door
        apply_changeset(
            base, ops({"op": "update", "kind": "wall", "id": w, "data": {"b": (5000, 0)}}), REFS
        )
    [problem] = exc.value.errors
    assert (problem.code, problem.element_id, problem.op_index) == (
        "opening_exceeds_wall",
        str(door),
        0,
    )


def test_missing_references() -> None:
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            PlanContent(),
            ops(
                add(
                    "opening",
                    new_id(),
                    wall_id=new_id(),
                    type="window",
                    offset_mm=0,
                    width_mm=900,
                    height_mm=1200,
                    swing="none",
                ),
                add(
                    "zone",
                    new_id(),
                    name="Z",
                    zone_type_id=new_id(),
                    boundary=[(0, 0), (1000, 0), (1000, 1000)],
                ),
                add("object", new_id(), catalog_item_rev_id=new_id(), position=(0, 0, 0)),
                add("object", new_id(), **desk(device_id=new_id())),
                add(
                    "object",
                    new_id(),
                    catalog_item_rev_id=MONITOR,
                    position=(0, 0, 740),
                    attached_to=new_id(),
                ),
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
                add(
                    "object",
                    new_id(),
                    catalog_item_rev_id=CHAIR,
                    position=(0, 0, 0),
                    allocation_mode="bookable",
                ),
            ),
            REFS,
        )
    assert sorted(codes(exc)) == [
        "allocation_mode_not_seat",
        "allocation_mode_required",
        "not_mountable",
    ]


def test_attach_rules_and_device_once() -> None:
    chair = new_id()
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            PlanContent(),
            ops(
                add("object", chair, catalog_item_rev_id=CHAIR, position=(0, 0, 0)),
                add(
                    "object",
                    new_id(),
                    catalog_item_rev_id=MONITOR,
                    position=(0, 0, 740),
                    attached_to=chair,
                ),
                add("object", new_id(), **desk(device_id=DEVICE)),
                add("object", new_id(), **desk(device_id=DEVICE)),
            ),
            REFS,
        )
    assert sorted(codes(exc)) == ["attach_not_allowed", "device_placed_twice"]


def test_zone_children_and_cycles() -> None:
    parent, child = new_id(), new_id()
    square = [(0, 0), (4000, 0), (4000, 4000), (0, 4000)]
    base = apply_changeset(
        PlanContent(),
        ops(
            add("zone", parent, name="Wing", zone_type_id=ZONE_TYPE, boundary=square),
            add(
                "zone",
                child,
                name="Pod",
                zone_type_id=ZONE_TYPE,
                boundary=square,
                parent_zone_id=parent,
            ),
        ),
        REFS,
    ).content
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(base, ops({"op": "delete", "kind": "zone", "id": parent}), REFS)
    assert codes(exc) == ["zone_has_children"] and exc.value.errors[0].op_index == 0
    # Deleting the children in the same changeset is fine.
    ok = apply_changeset(
        base,
        ops(
            {"op": "delete", "kind": "zone", "id": child},
            {"op": "delete", "kind": "zone", "id": parent},
        ),
        REFS,
    )
    assert ok.content.zones == []
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            base,
            ops({"op": "update", "kind": "zone", "id": parent, "data": {"parent_zone_id": child}}),
            REFS,
        )
    assert "zone_cycle" in codes(exc)


def test_untouched_legacy_problem_does_not_block_saves() -> None:
    legacy = PlacedObject(
        id=new_id(), catalog_item_rev_id=new_id(), position=(0, 0, 0)
    )  # unknown item
    base = PlanContent(objects=[legacy])
    fx = apply_changeset(base, ops(add("wall", new_id(), **wall())), REFS)  # unrelated edit
    assert len(fx.content.walls) == 1


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
    z = Zone(id=new_id(), name="Z", zone_type_id=ZONE_TYPE, boundary=[(0, 0), (1, 0), (1, 1)])
    content = PlanContent(
        zones=[z], walls=[Wall(id=new_id(), a=(0, 0), b=(1, 0), thickness_mm=1, height_mm=1)]
    )
    catalog, zone_types, devices = needed_references(
        content, ops(add("object", new_id(), **desk(device_id=DEVICE)))
    )
    assert (catalog, zone_types, devices) == ({DESK}, {ZONE_TYPE}, {DEVICE})


def test_op_parsing_rejects_unknown_kinds() -> None:
    with pytest.raises(ValueError):
        ops({"op": "add", "kind": "staircase", "id": new_id(), "data": {}})
    assert isinstance(ops({"op": "delete", "kind": "wall", "id": new_id()})[0], DeleteOp)
