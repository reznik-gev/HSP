"""Seat assignment against PostgreSQL (docs/0031, docs/0085, docs/0086)."""

from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy import select

from hsp import models
from hsp.models import new_id
from hsp.org.people import PeopleService
from hsp.problems import ProblemException
from hsp.seats.assignments import AssignmentIn, SeatAssignmentService
from tests.db.seat_helpers import person, unit


async def test_assign_reassign_and_unassign(published_floor_with_seats: dict[str, Any]) -> None:
    seats: SeatAssignmentService = published_floor_with_seats["seats"]
    maya, yoni = (
        await person(published_floor_with_seats, "Maya"),
        await person(published_floor_with_seats, "Yoni"),
    )
    assert (await seats.get(published_floor_with_seats["a"])).assignment is None

    first = await seats.assign(
        published_floor_with_seats["a"], AssignmentIn(person_id=maya, note="window")
    )
    assert first.assignment is not None and first.assignment.holder_person_id == maya
    assert first.replaced is None
    again = await seats.assign(
        published_floor_with_seats["a"], AssignmentIn(person_id=maya, note="window")
    )
    assert again.replaced is None  # same holder: nothing changes

    # docs/0086: a taken seat is reassigned, and the response names who was replaced.
    moved = await seats.assign(published_floor_with_seats["a"], AssignmentIn(person_id=yoni))
    assert moved.assignment is not None and moved.assignment.holder_person_id == yoni
    assert moved.replaced is not None and moved.replaced.holder_person_id == maya
    await seats.assign(
        published_floor_with_seats["b"], AssignmentIn(person_id=yoni)
    )  # one person, several seats

    released = await seats.unassign(published_floor_with_seats["a"])
    assert [f.holder_person_id for f in released.freed_seats] == [yoni]
    assert (await seats.unassign(published_floor_with_seats["a"])).freed_seats == []  # idempotent
    actions = list(
        await published_floor_with_seats["db"].scalars(
            select(models.AuditEvent.action)
            .where(models.AuditEvent.entity_id == published_floor_with_seats["a"])
            .order_by(models.AuditEvent.occurred_at)
        )
    )
    assert actions == ["seat.assigned", "seat.assigned", "seat.unassigned"]


async def test_only_published_assignable_seats_and_active_holders(
    published_floor_with_seats: dict[str, Any],
) -> None:
    seats: SeatAssignmentService = published_floor_with_seats["seats"]
    maya = await person(published_floor_with_seats, "Maya")
    for seat_id in (new_id(), published_floor_with_seats["draft_only"]):
        with pytest.raises(ProblemException) as exc:
            await seats.assign(seat_id, AssignmentIn(person_id=maya))
        assert exc.value.slug == "seat-not-found"
    with pytest.raises(ProblemException) as exc:
        await seats.assign(published_floor_with_seats["bookable"], AssignmentIn(person_id=maya))
    assert exc.value.slug == "seat-not-assignable"
    for body in (
        AssignmentIn(person_id=await person(published_floor_with_seats, "Gone", active=False)),
        AssignmentIn(unit_id=await unit(published_floor_with_seats, "Old team", archived=True)),
    ):
        with pytest.raises(ProblemException) as exc:
            await seats.assign(published_floor_with_seats["a"], body)
        assert exc.value.slug == "holder-inactive"
    with pytest.raises(ProblemException) as exc:
        await seats.assign(published_floor_with_seats["a"], AssignmentIn(person_id=new_id()))
    assert exc.value.errors is not None and exc.value.errors[0].code == "holder_not_found"
    with pytest.raises(ValidationError):
        AssignmentIn(person_id=maya, unit_id=new_id())
    team = await unit(published_floor_with_seats, "Platform")
    reserved = await seats.assign(published_floor_with_seats["a"], AssignmentIn(unit_id=team))
    assert reserved.assignment is not None and reserved.assignment.holder_unit_id == team


async def test_deactivating_a_person_frees_their_seats(
    published_floor_with_seats: dict[str, Any],
) -> None:
    seats: SeatAssignmentService = published_floor_with_seats["seats"]
    maya = await person(published_floor_with_seats, "Maya")
    await seats.assign(published_floor_with_seats["a"], AssignmentIn(person_id=maya))
    await seats.assign(published_floor_with_seats["b"], AssignmentIn(person_id=maya))

    people = PeopleService(published_floor_with_seats["db"], published_floor_with_seats["admin"])
    result = await people.deactivate(maya)
    assert result.person.active is False
    assert sorted(f.seat_id for f in result.freed_seats) == sorted(
        [published_floor_with_seats["a"], published_floor_with_seats["b"]]
    )
    assert (await seats.get(published_floor_with_seats["a"])).assignment is None
    assert (await people.set_active(maya, True)).active is True
    assert (
        await seats.get(published_floor_with_seats["a"])
    ).assignment is None  # reactivating doesn't give seats back


async def test_people_can_be_filtered_by_whether_they_hold_a_seat(
    published_floor_with_seats: dict[str, Any],
) -> None:
    seats: SeatAssignmentService = published_floor_with_seats["seats"]
    maya, eli = (
        await person(published_floor_with_seats, "Maya"),
        await person(published_floor_with_seats, "Eli"),
    )
    await seats.assign(published_floor_with_seats["a"], AssignmentIn(person_id=maya))
    people = PeopleService(published_floor_with_seats["db"], published_floor_with_seats["admin"])

    async def ids(seated: bool) -> set[Any]:
        rows = await people.list_people(
            q=None, unit_id=None, include_inactive=False, after=None, limit=500, seated=seated
        )
        return {p.id for p in rows}

    assert maya in await ids(True) and maya not in await ids(False)
    assert eli in await ids(False) and eli not in await ids(True)
