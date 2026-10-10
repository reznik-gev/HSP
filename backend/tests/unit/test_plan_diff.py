"""diff_plans: matching by stable id, field-level changes (docs/0028, docs/0080)."""

from hsp.models import new_id
from hsp.plans.diff import diff_plans
from hsp.plans.schema import PlacedObject, PlanContent, Wall

DESK_REV = new_id()


def desk(element_id: object, x: int, label: str = "3-B-01") -> PlacedObject:
    return PlacedObject(
        id=element_id,  # type: ignore[arg-type]
        catalog_item_rev_id=DESK_REV,
        position=(x, 1000, 0),
        rotation_ddeg=0,
        label=label,
        attached_to=None,
        device_id=None,
        allocation_mode="assigned",
    )


def test_moved_desk_is_changed_not_removed_and_added() -> None:
    d = new_id()
    diff = diff_plans(
        new_id(), PlanContent(objects=[desk(d, 1000)]), 1, PlanContent(objects=[desk(d, 1500)]), 2
    )
    assert diff.objects.added == [] and diff.objects.removed == []
    [change] = diff.objects.changed
    assert change.id == d
    assert change.before == {"position": [1000, 1000, 0]}
    assert change.after == {"position": [1500, 1000, 0]}


def test_added_removed_and_unchanged() -> None:
    keep, gone, new = new_id(), new_id(), new_id()
    wall = Wall(id=new_id(), a=(0, 0), b=(5000, 0), thickness_mm=150, height_mm=2800)
    a = PlanContent(walls=[wall], objects=[desk(keep, 0), desk(gone, 2000, "old")])
    b = PlanContent(walls=[wall], objects=[desk(keep, 0), desk(new, 4000, "new")])
    diff = diff_plans(new_id(), a, 1, b, 2)
    assert [o["label"] for o in diff.objects.added] == ["new"]
    assert [o["label"] for o in diff.objects.removed] == ["old"]
    assert diff.objects.changed == []
    assert diff.walls.added == diff.walls.removed == diff.walls.changed == []


def test_reverse_diff_is_the_inverse() -> None:
    d = new_id()
    a, b = PlanContent(objects=[desk(d, 1000)]), PlanContent(objects=[desk(d, 1500, "X")])
    forward, backward = diff_plans(new_id(), a, 1, b, 2), diff_plans(new_id(), b, 2, a, 1)
    assert forward.objects.changed[0].before == backward.objects.changed[0].after
    assert set(forward.objects.changed[0].after) == {"position", "label"}
