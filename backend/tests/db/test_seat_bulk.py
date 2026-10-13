"""Batch seat changes and the seat-assignment import against PostgreSQL (docs/0085, docs/0086)."""

from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncConnection

from hsp import models
from hsp.imports import read_table
from hsp.models import new_id
from hsp.problems import ProblemException
from hsp.seats.assignments import AssignmentIn, SeatAssignmentService
from hsp.seats.batch import BatchIn, SeatBatchService
from hsp.seats.imports import SeatImportService
from tests.db.seat_helpers import person, published_seats, unit


@pytest.fixture
async def ctx(conn: AsyncConnection) -> dict[str, Any]:
    ctx = await published_seats(conn)
    ctx["maya"], ctx["eli"], ctx["yoni"] = [await person(ctx, n) for n in ("Maya", "Eli", "Yoni")]
    ctx["gone"] = await person(ctx, "Gone", active=False)
    ctx["vision"] = await unit(ctx, "Vision")
    (await ctx["db"].get(models.OrgUnit, ctx["vision"])).external_id = f"VIS-{new_id().hex[-6:]}"
    await ctx["db"].commit()  # failed batches and dry runs roll back; keep the setup
    seats = SeatAssignmentService(ctx["db"], ctx["admin"])
    await seats.assign(ctx["a"], AssignmentIn(person_id=ctx["maya"]))
    await seats.assign(ctx["b"], AssignmentIn(person_id=ctx["eli"]))
    ctx["seats"] = seats
    return ctx


async def holder(ctx: dict[str, Any], seat: Any) -> Any:
    a = (await ctx["seats"].get(seat)).assignment
    return a and (a.holder_person_id or a.holder_unit_id)


def batch(*steps: dict[str, Any]) -> BatchIn:
    return BatchIn.model_validate({"steps": list(steps)})


async def test_swap_and_team_move(ctx: dict[str, Any]) -> None:
    service = SeatBatchService(ctx["db"], ctx["admin"])
    result = await service.apply(
        batch({"op": "swap", "seat_id": ctx["a"], "other_seat_id": ctx["b"]})
    )
    assert (await holder(ctx, ctx["a"]), await holder(ctx, ctx["b"])) == (ctx["eli"], ctx["maya"])
    assert {s.seat_id for s in result.seats} == {ctx["a"], ctx["b"]}

    # Steps see each other: free a, give it to Yoni, reserve b for Vision (Maya loses b).
    result = await service.apply(
        batch(
            {"op": "unassign", "seat_id": ctx["a"]},
            {"op": "assign", "seat_id": ctx["a"], "person_id": ctx["yoni"]},
            {"op": "assign", "seat_id": ctx["b"], "unit_id": ctx["vision"]},
        )
    )
    assert (await holder(ctx, ctx["a"]), await holder(ctx, ctx["b"])) == (
        ctx["yoni"],
        ctx["vision"],
    )
    assert {r.holder_person_id for r in result.released} == {ctx["eli"], ctx["maya"]}


async def test_a_failing_step_changes_nothing(ctx: dict[str, Any]) -> None:
    service = SeatBatchService(ctx["db"], ctx["admin"])
    with pytest.raises(ProblemException) as exc:
        await service.apply(
            batch(
                {"op": "assign", "seat_id": ctx["a"], "person_id": ctx["yoni"]},
                {"op": "assign", "seat_id": ctx["bookable"], "person_id": ctx["yoni"]},
                {"op": "assign", "seat_id": ctx["b"], "person_id": ctx["gone"]},
                {"op": "unassign", "seat_id": ctx["b"]},
            )
        )
    assert exc.value.slug == "batch-invalid"
    assert [(e.op_index, e.code) for e in exc.value.errors or []] == [
        (1, "seat_not_assignable"),
        (2, "holder_inactive"),
    ]
    assert (await holder(ctx, ctx["a"]), await holder(ctx, ctx["b"])) == (ctx["maya"], ctx["eli"])


async def labels(ctx: dict[str, Any]) -> dict[str, str]:
    out = {}
    for key in ("a", "b", "bookable"):
        label = (await ctx["seats"].get(ctx[key])).label
        assert label is not None
        out[key] = label
    return out


async def email(ctx: dict[str, Any], person_id: Any) -> str:
    p = await ctx["db"].get(models.Person, person_id)
    assert p is not None
    return str(p.email)


async def test_import_dry_run_apply_and_idempotent(ctx: dict[str, Any]) -> None:
    seat = await labels(ctx)
    vision = (await ctx["db"].get(models.OrgUnit, ctx["vision"])).external_id
    csv = (
        "seat_label,holder_email,holder_unit_external_id,note\n"
        f"{seat['a']},{await email(ctx, ctx['maya'])},,\n"  # unchanged
        f"{seat['b'].lower()},,{vision},team seat\n"  # Eli's seat goes to Vision
    ).encode()
    service = SeatImportService(ctx["db"], ctx["admin"])
    preview = await service.import_assignments(read_table("s.csv", csv), apply=False)
    assert (preview.applied, preview.unchanged, preview.updated, preview.errors) == (
        False,
        1,
        1,
        [],
    )
    assert await holder(ctx, ctx["b"]) == ctx["eli"]  # dry run wrote nothing

    done = await service.import_assignments(read_table("s.csv", csv), apply=True)
    assert (done.applied, done.updated) == (True, 1)
    assert await holder(ctx, ctx["b"]) == ctx["vision"]
    again = await service.import_assignments(read_table("s.csv", csv), apply=True)
    assert (again.created, again.updated, again.unchanged) == (0, 0, 2)


async def test_import_reports_every_bad_row(ctx: dict[str, Any]) -> None:
    seat = await labels(ctx)
    maya, gone = await email(ctx, ctx["maya"]), await email(ctx, ctx["gone"])
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
    report = await SeatImportService(ctx["db"], ctx["admin"]).import_assignments(
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
    assert report.warnings == ["Ignored unknown column(s): shoe_size."]
    assert await holder(ctx, ctx["a"]) == ctx["maya"]
