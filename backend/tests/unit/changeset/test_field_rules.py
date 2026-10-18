"""The changeset engine's field and shape rules: whole millimetres, bounds, rotation, and
walls and polygons that aren't degenerate (docs/0081)."""

from typing import Any

import pytest

from hsp.models import new_id
from hsp.plans.changeset import (
    AddOp,
    ChangesetRejected,
    DeleteOp,
    References,
    UpdateOp,
    apply_changeset,
)
from hsp.plans.schema import PlanContent
from tests.unit.changeset.stubs import BOWTIE, add, codes, desk, ops, wall, zone


@pytest.fixture(
    params=[
        pytest.param(({**wall(), "thickness_mm": 0}, "/ops/0/data/thickness_mm"), id="no-thickness"),
        pytest.param(({**wall(), "a": (0.5, 0)}, "/ops/0/data/a/0"), id="fractional-mm"),
        pytest.param(({**wall(), "a": (99_000_000, 0)}, "/ops/0/data/a/0"), id="out-of-bounds"),
    ]
)
def invalid_wall_field(request: pytest.FixtureRequest) -> tuple[dict[str, Any], str]:
    """A wall with one bad field, and the pointer to that field."""
    return request.param  # type: ignore[no-any-return]


@pytest.fixture
def add_wall_with_invalid_field(
    invalid_wall_field: tuple[dict[str, Any], str],
) -> list[AddOp | UpdateOp | DeleteOp]:
    data, _ = invalid_wall_field
    return ops(add("wall", new_id(), **data))


@pytest.fixture
def add_desk_rotated_a_full_turn() -> list[AddOp | UpdateOp | DeleteOp]:
    return ops(add("object", new_id(), **desk(rotation_ddeg=3600)))


@pytest.fixture
def add_degenerate_shapes() -> list[AddOp | UpdateOp | DeleteOp]:
    """A wall of no length, a bowtie zone, and a column footprint of two points."""
    return ops(
        add("wall", new_id(), **wall(a=(10, 10), b=(10, 10))),
        add("zone", new_id(), **zone(boundary=BOWTIE)),
        add("column", new_id(), footprint=[(0, 0), (100, 0)], height_mm=2800),
    )


def test_field_validation_points_at_the_field(
    empty_plan: PlanContent,
    refs: References,
    add_wall_with_invalid_field: list[AddOp | UpdateOp | DeleteOp],
    invalid_wall_field: tuple[dict[str, Any], str],
) -> None:
    _, pointer = invalid_wall_field
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(empty_plan, add_wall_with_invalid_field, refs)
    assert exc.value.errors[0].code == "invalid_field"
    assert exc.value.errors[0].pointer == pointer


def test_rotation_range(
    empty_plan: PlanContent,
    refs: References,
    add_desk_rotated_a_full_turn: list[AddOp | UpdateOp | DeleteOp],
) -> None:
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(empty_plan, add_desk_rotated_a_full_turn, refs)
    assert codes(exc) == ["invalid_field"]


def test_degenerate_wall_and_invalid_polygons(
    empty_plan: PlanContent,
    refs: References,
    add_degenerate_shapes: list[AddOp | UpdateOp | DeleteOp],
) -> None:
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(empty_plan, add_degenerate_shapes, refs)
    assert sorted(codes(exc)) == ["polygon_invalid", "polygon_invalid", "wall_degenerate"]
