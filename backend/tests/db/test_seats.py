"""Seat assignment against PostgreSQL (docs/0031, docs/0085, docs/0086)."""

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from hsp import models
from hsp.models import new_id
from hsp.org.people import PeopleService
from hsp.plans.drafts import SqlDraftRepository
from hsp.plans.publishing import PublishIn, PublishingService, SqlPublishRepository
from hsp.problems import ProblemException
from hsp.seats.assignments import AssignmentIn, SeatAssignmentService
from tests.db.plan_helpers import add, apply, context, desk_data


@pytest.fixture
async def ctx(conn: AsyncConnection) -> dict[str, Any]:
    ctx = await context(
        AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    )
    tag = new_id().hex[-6:]
    ctx["a"], ctx["b"], ctx["bookable"], ctx["draft_only"] = (new_id() for _ in range(4))
    await apply(
        ctx,
        0,
        add("object", ctx["a"], **desk_data(ctx, x=1000, label=f"A-{tag}")),
        add("object", ctx["b"], **desk_data(ctx, x=3000, label=f"B-{tag}")),
        add(
            "object",
            ctx["bookable"],
            **desk_data(ctx, x=5000, label=f"C-{tag}", allocation_mode="bookable"),
        ),
    )
    publishing = PublishingService(
        SqlDraftRepository(ctx["db"]), SqlPublishRepository(ctx["db"]), ctx["admin"]
    )
    await publishing.publish(ctx["floor"], PublishIn(base_revision=1))
    await apply(ctx, 0, add("object", ctx["draft_only"], **desk_data(ctx, x=7000, label=None)))
    ctx["seats"] = SeatAssignmentService(ctx["db"], ctx["admin"])
    return ctx


async def person(ctx: dict[str, Any], name: str, active: bool = True) -> uuid.UUID:
    now = datetime.now(UTC)
    p = models.Person(
        id=new_id(),
        tenant_id=ctx["tenant"],
        display_name=name,
        email=f"{name.lower()}-{new_id().hex[-8:]}@hsp.local",
        source=models.RecordSource.MANUAL,
        active=active,
        created_at=now,
        updated_at=now,
    )
    ctx["db"].add(p)
    await ctx["db"].flush()
    return p.id


async def unit(ctx: dict[str, Any], name: str, archived: bool = False) -> uuid.UUID:
    db, now = ctx["db"], datetime.now(UTC)
    root = await db.scalar(
        select(models.OrgUnit.id).where(
            models.OrgUnit.tenant_id == ctx["tenant"], models.OrgUnit.parent_id.is_(None)
        )
    )
    if root is None:
        root = new_id()
        db.add(
            models.OrgUnit(
                id=root,
                tenant_id=ctx["tenant"],
                name="Root",
                source=models.RecordSource.MANUAL,
                created_at=now,
                updated_at=now,
            )
        )
        await db.flush()
    u = models.OrgUnit(
        id=new_id(),
        tenant_id=ctx["tenant"],
        parent_id=root,
        source=models.RecordSource.MANUAL,
        name=name,
        created_at=now,
        updated_at=now,
        archived_at=now if archived else None,
    )
    db.add(u)
    await db.flush()
    return u.id


async def test_assign_reassign_and_unassign(ctx: dict[str, Any]) -> None:
    seats: SeatAssignmentService = ctx["seats"]
    maya, yoni = await person(ctx, "Maya"), await person(ctx, "Yoni")
    assert (await seats.get(ctx["a"])).assignment is None

    first = await seats.assign(ctx["a"], AssignmentIn(person_id=maya, note="window"))
    assert first.assignment is not None and first.assignment.holder_person_id == maya
    assert first.replaced is None
    again = await seats.assign(ctx["a"], AssignmentIn(person_id=maya, note="window"))
    assert again.replaced is None  # same holder: nothing changes

    # docs/0086: a taken seat is reassigned, and the response names who was replaced.
    moved = await seats.assign(ctx["a"], AssignmentIn(person_id=yoni))
    assert moved.assignment is not None and moved.assignment.holder_person_id == yoni
    assert moved.replaced is not None and moved.replaced.holder_person_id == maya
    await seats.assign(ctx["b"], AssignmentIn(person_id=yoni))  # one person, several seats

    released = await seats.unassign(ctx["a"])
    assert [f.holder_person_id for f in released.freed_seats] == [yoni]
    assert (await seats.unassign(ctx["a"])).freed_seats == []  # idempotent
    actions = list(
        await ctx["db"].scalars(
            select(models.AuditEvent.action)
            .where(models.AuditEvent.entity_id == ctx["a"])
            .order_by(models.AuditEvent.occurred_at)
        )
    )
    assert actions == ["seat.assigned", "seat.assigned", "seat.unassigned"]


async def test_only_published_assignable_seats_and_active_holders(ctx: dict[str, Any]) -> None:
    seats: SeatAssignmentService = ctx["seats"]
    maya = await person(ctx, "Maya")
    for seat_id in (new_id(), ctx["draft_only"]):
        with pytest.raises(ProblemException) as exc:
            await seats.assign(seat_id, AssignmentIn(person_id=maya))
        assert exc.value.slug == "seat-not-found"
    with pytest.raises(ProblemException) as exc:
        await seats.assign(ctx["bookable"], AssignmentIn(person_id=maya))
    assert exc.value.slug == "seat-not-assignable"
    for body in (
        AssignmentIn(person_id=await person(ctx, "Gone", active=False)),
        AssignmentIn(unit_id=await unit(ctx, "Old team", archived=True)),
    ):
        with pytest.raises(ProblemException) as exc:
            await seats.assign(ctx["a"], body)
        assert exc.value.slug == "holder-inactive"
    with pytest.raises(ProblemException) as exc:
        await seats.assign(ctx["a"], AssignmentIn(person_id=new_id()))
    assert exc.value.errors is not None and exc.value.errors[0].code == "holder_not_found"
    with pytest.raises(ValidationError):
        AssignmentIn(person_id=maya, unit_id=new_id())
    team = await unit(ctx, "Platform")
    reserved = await seats.assign(ctx["a"], AssignmentIn(unit_id=team))
    assert reserved.assignment is not None and reserved.assignment.holder_unit_id == team


async def test_deactivating_a_person_frees_their_seats(ctx: dict[str, Any]) -> None:
    seats: SeatAssignmentService = ctx["seats"]
    maya = await person(ctx, "Maya")
    await seats.assign(ctx["a"], AssignmentIn(person_id=maya))
    await seats.assign(ctx["b"], AssignmentIn(person_id=maya))

    people = PeopleService(ctx["db"], ctx["admin"])
    result = await people.deactivate(maya)
    assert result.person.active is False
    assert sorted(f.seat_id for f in result.freed_seats) == sorted([ctx["a"], ctx["b"]])
    assert (await seats.get(ctx["a"])).assignment is None
    assert (await people.set_active(maya, True)).active is True
    assert (await seats.get(ctx["a"])).assignment is None  # reactivating doesn't give seats back
