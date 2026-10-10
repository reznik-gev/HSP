"""Publish, discard and restore against PostgreSQL (docs/0028, docs/0082)."""

from typing import Any

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from hsp import models
from hsp.models import new_id
from hsp.plans.drafts import SqlDraftRepository
from hsp.plans.publishing import PublishIn, PublishingService, SqlPublishRepository
from hsp.problems import ProblemException
from tests.db.plan_helpers import add, apply, context, desk_data, lock, make_floor, plan, wall_data


@pytest.fixture
async def ctx(conn: AsyncConnection) -> dict[str, Any]:
    return await context(
        AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    )


def publishing(ctx: dict[str, Any]) -> PublishingService:
    db = ctx["db"]
    return PublishingService(SqlDraftRepository(db), SqlPublishRepository(db), ctx["admin"])


async def publish(ctx: dict[str, Any], revision: int, floor: Any = None) -> Any:
    return await publishing(ctx).publish(
        floor or ctx["floor"], PublishIn(base_revision=revision, note="go")
    )


async def states(ctx: dict[str, Any]) -> list[tuple[int, str]]:
    rows = await ctx["db"].execute(
        select(models.FloorVersion.version_no, models.FloorVersion.state)
        .where(models.FloorVersion.floor_id == ctx["floor"])
        .order_by(models.FloorVersion.version_no)
    )
    return [(n, s.value) for n, s in rows]


async def test_publish_supersedes_and_the_next_edit_starts_a_new_draft(ctx: dict[str, Any]) -> None:
    await apply(ctx, 0, add("wall", new_id(), **wall_data()))
    r1 = await publish(ctx, 1)
    assert (r1.published_version, r1.superseded_version) == (1, None)
    assert (await ctx["db"].get(models.Floor, ctx["floor"])).published_version == 1
    await apply(ctx, 0, add("wall", new_id(), **wall_data()))  # lock kept: next save starts v2
    r2 = await publish(ctx, 1)
    assert (r2.published_version, r2.superseded_version) == (2, 1)
    assert await states(ctx) == [(1, "superseded"), (2, "published")]


async def test_publish_needs_a_draft_and_the_reviewed_revision(ctx: dict[str, Any]) -> None:
    with pytest.raises(ProblemException) as exc:
        await publish(ctx, 0)
    assert exc.value.slug == "no-draft"
    await apply(ctx, 0, add("wall", new_id(), **wall_data()))
    await apply(ctx, 1, add("wall", new_id(), **wall_data()))
    with pytest.raises(ProblemException) as exc:
        await publish(ctx, 1)  # reviewer saw revision 1, the draft is at 2
    assert exc.value.slug == "stale-revision"


async def test_discard_restores_the_published_state_and_reuses_the_number(
    ctx: dict[str, Any],
) -> None:
    w, desk, new_desk = new_id(), new_id(), new_id()
    await apply(ctx, 0, add("wall", w, **wall_data()), add("object", desk, **desk_data(ctx)))
    await publish(ctx, 1)
    await apply(
        ctx,
        0,
        {"op": "update", "kind": "object", "id": str(desk), "data": {"position": [3000, 1000, 0]}},
        {"op": "delete", "kind": "wall", "id": str(w)},
        add("object", new_desk, **desk_data(ctx, x=5000, label="D2")),
    )
    await publishing(ctx).discard(ctx["floor"])
    await publishing(ctx).discard(ctx["floor"])  # idempotent

    assert await states(ctx) == [(1, "published")]
    latest = await plan(ctx, 2)  # what a new draft v2 would start from
    assert [x.id for x in latest.walls] == [w]  # the closed wall revision is open again
    assert {o.id: o.position for o in latest.objects} == {desk: (1000, 1000, 0)}
    assert await ctx["db"].get(models.FloorElement, new_desk) is None  # created in the draft: gone
    again = await apply(ctx, 0, add("wall", new_id(), **wall_data()))
    assert again.version == 2  # no gap in numbering (docs/0081)


async def test_restore_brings_back_an_old_version_exactly(ctx: dict[str, Any]) -> None:
    w, desk = new_id(), new_id()
    await apply(ctx, 0, add("wall", w, **wall_data()), add("object", desk, **desk_data(ctx)))
    await publish(ctx, 1)
    await apply(
        ctx,
        0,
        {"op": "update", "kind": "object", "id": str(desk), "data": {"position": [4000, 1000, 0]}},
        {"op": "delete", "kind": "wall", "id": str(w)},
    )
    await publish(ctx, 1)  # v2: desk moved, wall gone

    await publishing(ctx).restore(ctx["floor"], 1)
    v1, v3 = await plan(ctx, 1), await plan(ctx, 3)
    assert v3.model_dump() == v1.model_dump()  # same elements, same ids, same geometry
    assert (await plan(ctx, 2)).walls == []  # v2 untouched
    with pytest.raises(ProblemException) as exc:
        await publishing(ctx).restore(ctx["floor"], 1)
    assert exc.value.slug == "draft-exists"  # never overwrite unsaved work


async def test_publish_conflicts_labels_devices_and_assignments(ctx: dict[str, Any]) -> None:
    db, tenant = ctx["db"], ctx["tenant"]
    # Another floor in the same building already publishes seat "A-01" and a device.
    other, _ = await make_floor(db, tenant, ctx["building"], level=1)
    await lock(db, tenant, other)
    device = models.Device(id=new_id(), tenant_id=tenant, asset_tag=f"MON-{new_id().hex[:5]}")
    db.add(device)
    await db.flush()
    await apply(
        ctx,
        0,
        add("object", new_id(), **desk_data(ctx, label="A-01", device_id=str(device.id))),
        floor=other,
    )
    await publish(ctx, 1, floor=other)

    seat = new_id()
    await apply(
        ctx,
        0,
        add("object", seat, **desk_data(ctx, label="A-01")),
        add("object", new_id(), **desk_data(ctx, x=3000, label="A-02", device_id=str(device.id))),
    )
    with pytest.raises(ProblemException) as exc:
        await publish(ctx, 1)
    assert exc.value.slug == "publish-conflicts"
    assert sorted(e.code for e in exc.value.errors or []) == [
        "device_on_other_floor",
        "seat_label_duplicate",
    ]


async def test_assigned_seat_cannot_be_removed_by_publishing(ctx: dict[str, Any]) -> None:
    seat = new_id()
    await apply(ctx, 0, add("object", seat, **desk_data(ctx)))
    await publish(ctx, 1)
    person = (
        await ctx["db"].execute(
            text(
                "INSERT INTO person (id, tenant_id, display_name, email, source, active, "
                "created_at, updated_at) "
                "VALUES (:id, :t, 'Dana', :e, 'manual', true, now(), now()) RETURNING id"
            ),
            {"id": new_id(), "t": ctx["tenant"], "e": f"dana-{new_id().hex[:6]}@hsp.local"},
        )
    ).scalar_one()
    ctx["db"].add(
        models.SeatAssignment(
            id=new_id(),
            tenant_id=ctx["tenant"],
            seat_element_id=seat,
            holder_person_id=person,
            assigned_by="alice",
        )
    )
    await ctx["db"].flush()
    await apply(ctx, 0, {"op": "delete", "kind": "object", "id": str(seat)})
    with pytest.raises(ProblemException) as exc:
        await publish(ctx, 1)
    assert [e.code for e in exc.value.errors or []] == ["assigned_seat_removed"]
