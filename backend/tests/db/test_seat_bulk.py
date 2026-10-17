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
async def seats_for_bulk_assignment(published_floor_with_seats: dict[str, Any]) -> dict[str, Any]:
    """The seat floor with Maya on seat a, Eli on seat b, Yoni free, an inactive person and a
    Vision team with an external id."""
    seats_for_bulk_assignment = published_floor_with_seats
    (
        seats_for_bulk_assignment["maya"],
        seats_for_bulk_assignment["eli"],
        seats_for_bulk_assignment["yoni"],
    ) = [await person(seats_for_bulk_assignment, n) for n in ("Maya", "Eli", "Yoni")]
    seats_for_bulk_assignment["gone"] = await person(
        seats_for_bulk_assignment, "Gone", active=False
    )
    seats_for_bulk_assignment["vision"] = await unit(seats_for_bulk_assignment, "Vision")
    (
        await seats_for_bulk_assignment["db"].get(
            models.OrgUnit, seats_for_bulk_assignment["vision"]
        )
    ).external_id = f"VIS-{new_id().hex[-6:]}"
    await seats_for_bulk_assignment[
        "db"
    ].commit()  # failed batches and dry runs roll back; keep the setup
    seats = SeatAssignmentService(
        seats_for_bulk_assignment["db"], seats_for_bulk_assignment["admin"]
    )
    await seats.assign(
        seats_for_bulk_assignment["a"], AssignmentIn(person_id=seats_for_bulk_assignment["maya"])
    )
    await seats.assign(
        seats_for_bulk_assignment["b"], AssignmentIn(person_id=seats_for_bulk_assignment["eli"])
    )
    seats_for_bulk_assignment["seats"] = seats
    return seats_for_bulk_assignment


async def holder(seats_for_bulk_assignment: dict[str, Any], seat: Any) -> Any:
    a = (await seats_for_bulk_assignment["seats"].get(seat)).assignment
    return a and (a.holder_person_id or a.holder_unit_id)


def batch(*steps: dict[str, Any]) -> BatchIn:
    return BatchIn.model_validate({"steps": list(steps)})


async def test_swap_and_team_move(seats_for_bulk_assignment: dict[str, Any]) -> None:
    service = SeatBatchService(seats_for_bulk_assignment["db"], seats_for_bulk_assignment["admin"])
    result = await service.apply(
        batch(
            {
                "op": "swap",
                "seat_id": seats_for_bulk_assignment["a"],
                "other_seat_id": seats_for_bulk_assignment["b"],
            }
        )
    )
    assert (
        await holder(seats_for_bulk_assignment, seats_for_bulk_assignment["a"]),
        await holder(seats_for_bulk_assignment, seats_for_bulk_assignment["b"]),
    ) == (
        seats_for_bulk_assignment["eli"],
        seats_for_bulk_assignment["maya"],
    )
    assert {s.seat_id for s in result.seats} == {
        seats_for_bulk_assignment["a"],
        seats_for_bulk_assignment["b"],
    }

    # Steps see each other: free a, give it to Yoni, reserve b for Vision (Maya loses b).
    result = await service.apply(
        batch(
            {"op": "unassign", "seat_id": seats_for_bulk_assignment["a"]},
            {
                "op": "assign",
                "seat_id": seats_for_bulk_assignment["a"],
                "person_id": seats_for_bulk_assignment["yoni"],
            },
            {
                "op": "assign",
                "seat_id": seats_for_bulk_assignment["b"],
                "unit_id": seats_for_bulk_assignment["vision"],
            },
        )
    )
    assert (
        await holder(seats_for_bulk_assignment, seats_for_bulk_assignment["a"]),
        await holder(seats_for_bulk_assignment, seats_for_bulk_assignment["b"]),
    ) == (
        seats_for_bulk_assignment["yoni"],
        seats_for_bulk_assignment["vision"],
    )
    assert {r.holder_person_id for r in result.released} == {
        seats_for_bulk_assignment["eli"],
        seats_for_bulk_assignment["maya"],
    }


async def test_a_failing_step_changes_nothing(seats_for_bulk_assignment: dict[str, Any]) -> None:
    service = SeatBatchService(seats_for_bulk_assignment["db"], seats_for_bulk_assignment["admin"])
    with pytest.raises(ProblemException) as exc:
        await service.apply(
            batch(
                {
                    "op": "assign",
                    "seat_id": seats_for_bulk_assignment["a"],
                    "person_id": seats_for_bulk_assignment["yoni"],
                },
                {
                    "op": "assign",
                    "seat_id": seats_for_bulk_assignment["bookable"],
                    "person_id": seats_for_bulk_assignment["yoni"],
                },
                {
                    "op": "assign",
                    "seat_id": seats_for_bulk_assignment["b"],
                    "person_id": seats_for_bulk_assignment["gone"],
                },
                {"op": "unassign", "seat_id": seats_for_bulk_assignment["b"]},
            )
        )
    assert exc.value.slug == "batch-invalid"
    assert [(e.op_index, e.code) for e in exc.value.errors or []] == [
        (1, "seat_not_assignable"),
        (2, "holder_inactive"),
    ]
    assert (
        await holder(seats_for_bulk_assignment, seats_for_bulk_assignment["a"]),
        await holder(seats_for_bulk_assignment, seats_for_bulk_assignment["b"]),
    ) == (
        seats_for_bulk_assignment["maya"],
        seats_for_bulk_assignment["eli"],
    )


async def labels(seats_for_bulk_assignment: dict[str, Any]) -> dict[str, str]:
    out = {}
    for key in ("a", "b", "bookable"):
        label = (await seats_for_bulk_assignment["seats"].get(seats_for_bulk_assignment[key])).label
        assert label is not None
        out[key] = label
    return out


async def email(seats_for_bulk_assignment: dict[str, Any], person_id: Any) -> str:
    p = await seats_for_bulk_assignment["db"].get(models.Person, person_id)
    assert p is not None
    return str(p.email)


async def test_import_dry_run_apply_and_idempotent(
    seats_for_bulk_assignment: dict[str, Any],
) -> None:
    seat = await labels(seats_for_bulk_assignment)
    vision = (
        await seats_for_bulk_assignment["db"].get(
            models.OrgUnit, seats_for_bulk_assignment["vision"]
        )
    ).external_id
    maya = await email(seats_for_bulk_assignment, seats_for_bulk_assignment["maya"])
    csv = (
        "seat_label,holder_email,holder_unit_external_id,note\n"
        f"{seat['a']},{maya},,\n"  # unchanged
        f"{seat['b'].lower()},,{vision},team seat\n"  # Eli's seat goes to Vision
    ).encode()
    service = SeatImportService(seats_for_bulk_assignment["db"], seats_for_bulk_assignment["admin"])
    preview = await service.import_assignments(read_table("s.csv", csv), apply=False)
    assert (preview.applied, preview.unchanged, preview.updated, preview.errors) == (
        False,
        1,
        1,
        [],
    )
    assert (
        await holder(seats_for_bulk_assignment, seats_for_bulk_assignment["b"])
        == seats_for_bulk_assignment["eli"]
    )  # dry run wrote nothing

    done = await service.import_assignments(read_table("s.csv", csv), apply=True)
    assert (done.applied, done.updated) == (True, 1)
    assert (
        await holder(seats_for_bulk_assignment, seats_for_bulk_assignment["b"])
        == seats_for_bulk_assignment["vision"]
    )
    again = await service.import_assignments(read_table("s.csv", csv), apply=True)
    assert (again.created, again.updated, again.unchanged) == (0, 0, 2)


async def test_import_reports_every_bad_row(seats_for_bulk_assignment: dict[str, Any]) -> None:
    seat = await labels(seats_for_bulk_assignment)
    maya, gone = (
        await email(seats_for_bulk_assignment, seats_for_bulk_assignment["maya"]),
        await email(seats_for_bulk_assignment, seats_for_bulk_assignment["gone"]),
    )
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
    report = await SeatImportService(
        seats_for_bulk_assignment["db"], seats_for_bulk_assignment["admin"]
    ).import_assignments(read_table("s.csv", csv), apply=True)
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
    assert (
        await holder(seats_for_bulk_assignment, seats_for_bulk_assignment["a"])
        == seats_for_bulk_assignment["maya"]
    )
