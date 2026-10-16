"""Shared setup for the seat tests (docs/0085)."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.models import new_id
from hsp.plans.drafts import SqlDraftRepository
from hsp.plans.publishing import PublishIn, PublishingService, SqlPublishRepository
from hsp.seats.assignments import AssignmentIn, SeatAssignmentService
from tests.db.plan_helpers import add, apply, context, stub_desk


async def published_seats(db: AsyncSession) -> dict[str, Any]:
    """A floor whose published plan has two assigned seats (a, b), a bookable one, and a seat
    that exists only in the draft (draft_only)."""
    ctx = await context(db)
    tag = new_id().hex[-6:]
    ctx["a"], ctx["b"], ctx["bookable"], ctx["draft_only"] = (new_id() for _ in range(4))
    await apply(
        ctx,
        0,
        add("object", ctx["a"], **stub_desk(ctx, x=1000, label=f"A-{tag}")),
        add("object", ctx["b"], **stub_desk(ctx, x=3000, label=f"B-{tag}")),
        add(
            "object",
            ctx["bookable"],
            **stub_desk(ctx, x=5000, label=f"C-{tag}", allocation_mode="bookable"),
        ),
    )
    publishing = PublishingService(
        SqlDraftRepository(ctx["db"]), SqlPublishRepository(ctx["db"]), ctx["admin"]
    )
    await publishing.publish(ctx["floor"], PublishIn(base_revision=1))
    await apply(ctx, 0, add("object", ctx["draft_only"], **stub_desk(ctx, x=7000, label=None)))
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


async def member(ctx: dict[str, Any], person_id: Any, unit_id: Any) -> None:
    ctx["db"].add(
        models.UnitMembership(
            person_id=person_id,
            unit_id=unit_id,
            tenant_id=ctx["tenant"],
            is_primary=True,
            primary_override=True,
        )
    )
    await ctx["db"].flush()


async def seated(ctx: dict[str, Any]) -> dict[str, Any]:
    """Maya (primary unit Platform, with Eli) sits at seat a; seat b is reserved for Vision."""
    seats = SeatAssignmentService(ctx["db"], ctx["admin"])
    platform, vision = await unit(ctx, "Platform"), await unit(ctx, "Vision")
    maya, eli = await person(ctx, "Maya"), await person(ctx, "Eli")
    await member(ctx, maya, platform)
    await member(ctx, eli, platform)
    await seats.assign(ctx["a"], AssignmentIn(person_id=maya))
    await seats.assign(ctx["b"], AssignmentIn(unit_id=vision))
    return {"platform": platform, "vision": vision, "maya": maya, "eli": eli}
