"""Batch seat changes and the seat-assignment import against PostgreSQL (docs/0085, docs/0086)."""

from typing import Any

import pytest

from hsp import models
from hsp.imports import read_table
from hsp.models import new_id
from hsp.problems import ProblemException
from hsp.seats.assignments import AssignmentIn, SeatAssignmentService
from hsp.seats.batch import BatchIn, SeatBatchService
from hsp.seats.imports import SeatImportService
from tests.db.seat_helpers import person, unit


@pytest.fixture
async def bulk(seat_floor: dict[str, Any]) -> dict[str, Any]:
    """The seat floor with Maya on seat a, Eli on seat b, Yoni free, an inactive person and a
    Vision team with an external id."""
    bulk = seat_floor
    bulk["maya"], bulk["eli"], bulk["yoni"] = [
        await person(bulk, n) for n in ("Maya", "Eli", "Yoni")
    ]
    bulk["gone"] = await person(bulk, "Gone", active=False)
    bulk["vision"] = await unit(bulk, "Vision")
    (await bulk["db"].get(models.OrgUnit, bulk["vision"])).external_id = f"VIS-{new_id().hex[-6:]}"
    await bulk["db"].commit()  # failed batches and dry runs roll back; keep the setup
    seats = SeatAssignmentService(bulk["db"], bulk["admin"])
    await seats.assign(bulk["a"], AssignmentIn(person_id=bulk["maya"]))
    await seats.assign(bulk["b"], AssignmentIn(person_id=bulk["eli"]))
    bulk["seats"] = seats
    return bulk


async def holder(bulk: dict[str, Any], seat: Any) -> Any:
    a = (await bulk["seats"].get(seat)).assignment
    return a and (a.holder_person_id or a.holder_unit_id)


def batch(*steps: dict[str, Any]) -> BatchIn:
    return BatchIn.model_validate({"steps": list(steps)})


async def test_swap_and_team_move(bulk: dict[str, Any]) -> None:
    service = SeatBatchService(bulk["db"], bulk["admin"])
    result = await service.apply(
        batch({"op": "swap", "seat_id": bulk["a"], "other_seat_id": bulk["b"]})
    )
    assert (await holder(bulk, bulk["a"]), await holder(bulk, bulk["b"])) == (
        bulk["eli"],
        bulk["maya"],
    )
    assert {s.seat_id for s in result.seats} == {bulk["a"], bulk["b"]}

    # Steps see each other: free a, give it to Yoni, reserve b for Vision (Maya loses b).
    result = await service.apply(
        batch(
            {"op": "unassign", "seat_id": bulk["a"]},
            {"op": "assign", "seat_id": bulk["a"], "person_id": bulk["yoni"]},
            {"op": "assign", "seat_id": bulk["b"], "unit_id": bulk["vision"]},
        )
    )
    assert (await holder(bulk, bulk["a"]), await holder(bulk, bulk["b"])) == (
        bulk["yoni"],
        bulk["vision"],
    )
    assert {r.holder_person_id for r in result.released} == {bulk["eli"], bulk["maya"]}


async def test_a_failing_step_changes_nothing(bulk: dict[str, Any]) -> None:
    service = SeatBatchService(bulk["db"], bulk["admin"])
    with pytest.raises(ProblemException) as exc:
        await service.apply(
            batch(
                {"op": "assign", "seat_id": bulk["a"], "person_id": bulk["yoni"]},
                {"op": "assign", "seat_id": bulk["bookable"], "person_id": bulk["yoni"]},
                {"op": "assign", "seat_id": bulk["b"], "person_id": bulk["gone"]},
                {"op": "unassign", "seat_id": bulk["b"]},
            )
        )
    assert exc.value.slug == "batch-invalid"
    assert [(e.op_index, e.code) for e in exc.value.errors or []] == [
        (1, "seat_not_assignable"),
        (2, "holder_inactive"),
    ]
    assert (await holder(bulk, bulk["a"]), await holder(bulk, bulk["b"])) == (
        bulk["maya"],
        bulk["eli"],
    )


async def labels(bulk: dict[str, Any]) -> dict[str, str]:
    out = {}
    for key in ("a", "b", "bookable"):
        label = (await bulk["seats"].get(bulk[key])).label
        assert label is not None
        out[key] = label
    return out


async def email(bulk: dict[str, Any], person_id: Any) -> str:
    p = await bulk["db"].get(models.Person, person_id)
    assert p is not None
    return str(p.email)


async def test_import_dry_run_apply_and_idempotent(bulk: dict[str, Any]) -> None:
    seat = await labels(bulk)
    vision = (await bulk["db"].get(models.OrgUnit, bulk["vision"])).external_id
    csv = (
        "seat_label,holder_email,holder_unit_external_id,note\n"
        f"{seat['a']},{await email(bulk, bulk['maya'])},,\n"  # unchanged
        f"{seat['b'].lower()},,{vision},team seat\n"  # Eli's seat goes to Vision
    ).encode()
    service = SeatImportService(bulk["db"], bulk["admin"])
    preview = await service.import_assignments(read_table("s.csv", csv), apply=False)
    assert (preview.applied, preview.unchanged, preview.updated, preview.errors) == (
        False,
        1,
        1,
        [],
    )
    assert await holder(bulk, bulk["b"]) == bulk["eli"]  # dry run wrote nothing

    done = await service.import_assignments(read_table("s.csv", csv), apply=True)
    assert (done.applied, done.updated) == (True, 1)
    assert await holder(bulk, bulk["b"]) == bulk["vision"]
    again = await service.import_assignments(read_table("s.csv", csv), apply=True)
    assert (again.created, again.updated, again.unchanged) == (0, 0, 2)


async def test_import_reports_every_bad_row(bulk: dict[str, Any]) -> None:
    seat = await labels(bulk)
    maya, gone = await email(bulk, bulk["maya"]), await email(bulk, bulk["gone"])
    csv = (
        "seat_label,building_code,holder_email,holder_unit_external_id,shoe_size\n"
        f"NOPE-1,,{maya},,\n"
        f"{seat['bookable']},,{maya},,\n"
        f"{seat['a']},,{maya},X,\n"
        f"{seat['a']},,{gone},,\n"
        f"{seat['b']},,nobody@hsp.local,,\n"
        f"{seat['b']},WRONG,{maya},,\n"
        f"{seat['a']},,{maya},,\n"
        f"{seat['a']},,{maya},,\n"
    ).encode()
    report = await SeatImportService(bulk["db"], bulk["admin"]).import_assignments(
        read_table("s.csv", csv), apply=True
    )
    assert report.applied is False
    assert [(e.row, e.code) for e in report.errors] == [
        (2, "seat_not_found"),
        (3, "seat_not_assignable"),
        (4, "holder_required"),
        (5, "holder_inactive"),
        (6, "holder_not_found"),
        (7, "seat_not_found"),
        (9, "duplicate_row"),
    ]
    assert [e.params for e in report.errors if e.code == "seat_not_found"] == [
        {"value": "NOPE-1"},
        {"value": seat["b"], "building": "WRONG"},
    ]
    assert [w.params for w in report.warnings] == [{"columns": "shoe_size"}]
    assert await holder(bulk, bulk["a"]) == bulk["maya"]
