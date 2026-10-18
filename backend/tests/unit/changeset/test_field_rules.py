"""The changeset engine's field and shape rules: whole millimetres, bounds, rotation, and
walls and polygons that aren't degenerate (docs/0081)."""

from typing import Any

import pytest

from hsp.models import new_id
from hsp.plans.changeset import ChangesetRejected, apply_changeset
from hsp.plans.schema import PlanContent
from tests.unit.changeset.stubs import BOWTIE, REFS, add, codes, desk, ops, wall, zone

#: A column footprint of two points: not a polygon.
TWO_POINTS = [(0, 0), (100, 0)]


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
    with pytest.raises(ChangesetRejected) as exc:
        apply_changeset(
            PlanContent(),
            ops(
                add("wall", new_id(), **wall(a=(10, 10), b=(10, 10))),
                add("zone", new_id(), **zone(boundary=BOWTIE)),
                add("column", new_id(), footprint=TWO_POINTS, height_mm=2800),
            ),
            REFS,
        )
    assert sorted(codes(exc)) == ["polygon_invalid", "polygon_invalid", "wall_degenerate"]
