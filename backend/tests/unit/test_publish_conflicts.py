"""publish_conflicts: the docs/0082 publish checks as a pure function."""

from hsp.models import new_id
from hsp.plans.publishing import publish_conflicts
from hsp.plans.schema import CatalogItem, PlacedObject, PlanContent

DESK = new_id()
CATALOG = {
    str(DESK): CatalogItem(
        id=DESK,
        item_id=new_id(),
        key="desk",
        category="desk",
        name="Desk",
        shape="box",
        width_mm=1600,
        depth_mm=800,
        height_mm=740,
        color=None,
        is_seat=True,
        mountable=False,
        attaches_to_categories=[],
        footprint_blocks=True,
    )
}


def seat(label: str | None, mode: str | None = "assigned", **extra: object) -> PlacedObject:
    element_id = extra.pop("id", None) or new_id()
    return PlacedObject(
        id=element_id,
        catalog_item_rev_id=DESK,
        position=(0, 0, 0),
        label=label,
        allocation_mode=mode,
        **extra,
    )  # type: ignore[arg-type]


def plan(*objects: PlacedObject) -> PlanContent:
    return PlanContent(objects=list(objects), catalog=CATALOG)


def test_clean_draft_has_no_conflicts() -> None:
    assert (
        publish_conflicts(plan(seat("A-01"), seat("A-02"), seat(None)), plan(), {}, {}, set()) == []
    )


def test_duplicate_label_on_the_floor_and_in_the_building() -> None:
    a, b = seat("A-01"), seat("A-01")
    problems = publish_conflicts(plan(a, b, seat("B-07")), plan(), {"B-07": "Level 1"}, {}, set())
    assert [p.code for p in problems] == ["seat_label_duplicate", "seat_label_duplicate"]
    assert problems[0].related_ids == [str(a.id)]
    assert "Level 1" in problems[1].message


def test_device_already_on_another_floor() -> None:
    device = new_id()
    problems = publish_conflicts(
        plan(seat("A-01", device_id=device)), plan(), {}, {device: "Level 2"}, set()
    )
    assert [p.code for p in problems] == ["device_on_other_floor"]


def test_assigned_seats_must_stay_assignable() -> None:
    kept, removed, now_bookable = seat("A-01"), seat("A-02"), seat("A-03")
    draft = plan(kept, seat("A-03", mode="bookable", id=now_bookable.id))
    problems = publish_conflicts(
        draft, plan(kept, removed, now_bookable), {}, {}, {kept.id, removed.id, now_bookable.id}
    )
    assert sorted(p.code for p in problems) == [
        "assigned_seat_not_assignable",
        "assigned_seat_removed",
    ]
