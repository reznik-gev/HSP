"""publish_conflicts: the docs/0082 publish checks as a pure function."""

from typing import Any

from hsp.models import new_id
from hsp.plans.publishing import publish_conflicts, seats_losing_assignment
from hsp.plans.schema import PlacedObject, PlanContent
from tests.stubs import stub_catalog_item, stub_placed_object

DESK = new_id()
CATALOG = {str(DESK): stub_catalog_item(DESK, "desk", "desk", is_seat=True)}
DEVICE = new_id()


def seat(label: str | None, mode: str | None = "assigned", **over: Any) -> PlacedObject:
    return stub_placed_object(DESK, label=label, allocation_mode=mode, **over)


def plan(*objects: PlacedObject) -> PlanContent:
    return PlanContent(objects=list(objects), catalog=CATALOG)


A01, ALSO_A01 = seat("A-01"), seat("A-01")
A02, A03 = seat("A-02"), seat("A-03")
A03_NOW_BOOKABLE = seat("A-03", mode="bookable", id=A03.id)


def test_clean_draft_has_no_conflicts() -> None:
    assert publish_conflicts(plan(A01, A02, seat(None)), plan(), {}, {}) == []


def test_duplicate_label_on_the_floor_and_in_the_building() -> None:
    problems = publish_conflicts(plan(A01, ALSO_A01, seat("B-07")), plan(), {"B-07": "Level 1"}, {})
    assert [p.code for p in problems] == ["seat_label_duplicate", "seat_label_duplicate"]
    assert problems[0].related_ids == [str(A01.id)]
    assert "Level 1" in problems[1].message


def test_device_already_on_another_floor() -> None:
    problems = publish_conflicts(
        plan(seat("A-01", device_id=DEVICE)), plan(), {}, {DEVICE: "Level 2"}
    )
    assert [p.code for p in problems] == ["device_on_other_floor"]


def test_assigned_seats_the_draft_drops_are_freed_not_conflicts() -> None:
    draft = plan(A01, A03_NOW_BOOKABLE)
    assert publish_conflicts(draft, plan(A01, A02, A03), {}, {}) == []  # docs/0086
    assigned = {A01.id, A02.id, A03.id}
    assert seats_losing_assignment(draft, assigned) == {A02.id, A03.id}
