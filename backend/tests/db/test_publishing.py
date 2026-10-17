"""Publish, discard and restore against PostgreSQL (docs/0028, docs/0082)."""

from typing import Any

import pytest
from sqlalchemy import select, text

from hsp import models
from hsp.models import new_id
from hsp.plans.drafts import SqlDraftRepository
from hsp.plans.publishing import PublishIn, PublishingService, SqlPublishRepository
from hsp.problems import ProblemException
from tests.db.plan_helpers import add, apply, lock, make_floor, plan, stub_desk, stub_wall


def publishing(admin_editing_new_floor: dict[str, Any]) -> PublishingService:
    rolled_back_db_session = admin_editing_new_floor["db"]
    return PublishingService(
        SqlDraftRepository(rolled_back_db_session),
        SqlPublishRepository(rolled_back_db_session),
        admin_editing_new_floor["admin"],
    )


async def publish(admin_editing_new_floor: dict[str, Any], revision: int, floor: Any = None) -> Any:
    return await publishing(admin_editing_new_floor).publish(
        floor or admin_editing_new_floor["floor"], PublishIn(base_revision=revision, note="go")
    )


async def states(admin_editing_new_floor: dict[str, Any]) -> list[tuple[int, str]]:
    rows = await admin_editing_new_floor["db"].execute(
        select(models.FloorVersion.version_no, models.FloorVersion.state)
        .where(models.FloorVersion.floor_id == admin_editing_new_floor["floor"])
        .order_by(models.FloorVersion.version_no)
    )
    return [(n, s.value) for n, s in rows]


async def test_publish_supersedes_and_the_next_edit_starts_a_new_draft(
    admin_editing_new_floor: dict[str, Any],
) -> None:
    await apply(admin_editing_new_floor, 0, add("wall", new_id(), **stub_wall()))
    r1 = await publish(admin_editing_new_floor, 1)
    assert (r1.published_version, r1.superseded_version) == (1, None)
    assert (
        await admin_editing_new_floor["db"].get(models.Floor, admin_editing_new_floor["floor"])
    ).published_version == 1
    await apply(
        admin_editing_new_floor, 0, add("wall", new_id(), **stub_wall())
    )  # lock kept: next save starts v2
    r2 = await publish(admin_editing_new_floor, 1)
    assert (r2.published_version, r2.superseded_version) == (2, 1)
    assert await states(admin_editing_new_floor) == [(1, "superseded"), (2, "published")]


async def test_publish_needs_a_draft_and_the_reviewed_revision(
    admin_editing_new_floor: dict[str, Any],
) -> None:
    with pytest.raises(ProblemException) as exc:
        await publish(admin_editing_new_floor, 0)
    assert exc.value.slug == "no-draft"
    await apply(admin_editing_new_floor, 0, add("wall", new_id(), **stub_wall()))
    await apply(admin_editing_new_floor, 1, add("wall", new_id(), **stub_wall()))
    with pytest.raises(ProblemException) as exc:
        await publish(admin_editing_new_floor, 1)  # reviewer saw revision 1, the draft is at 2
    assert exc.value.slug == "stale-revision"


async def test_discard_restores_the_published_state_and_reuses_the_number(
    admin_editing_new_floor: dict[str, Any],
) -> None:
    w, desk, new_desk = new_id(), new_id(), new_id()
    await apply(
        admin_editing_new_floor,
        0,
        add("wall", w, **stub_wall()),
        add("object", desk, **stub_desk(admin_editing_new_floor)),
    )
    await publish(admin_editing_new_floor, 1)
    await apply(
        admin_editing_new_floor,
        0,
        {"op": "update", "kind": "object", "id": str(desk), "data": {"position": [3000, 1000, 0]}},
        {"op": "delete", "kind": "wall", "id": str(w)},
        add("object", new_desk, **stub_desk(admin_editing_new_floor, x=5000, label="D2")),
    )
    await publishing(admin_editing_new_floor).discard(admin_editing_new_floor["floor"])
    await publishing(admin_editing_new_floor).discard(
        admin_editing_new_floor["floor"]
    )  # idempotent

    assert await states(admin_editing_new_floor) == [(1, "published")]
    latest = await plan(admin_editing_new_floor, 2)  # what a new draft v2 would start from
    assert [x.id for x in latest.walls] == [w]  # the closed wall revision is open again
    assert {o.id: o.position for o in latest.objects} == {desk: (1000, 1000, 0)}
    assert (
        await admin_editing_new_floor["db"].get(models.FloorElement, new_desk) is None
    )  # created in the draft: gone
    again = await apply(admin_editing_new_floor, 0, add("wall", new_id(), **stub_wall()))
    assert again.version == 2  # no gap in numbering (docs/0081)


async def test_restore_brings_back_an_old_version_exactly(
    admin_editing_new_floor: dict[str, Any],
) -> None:
    w, desk = new_id(), new_id()
    await apply(
        admin_editing_new_floor,
        0,
        add("wall", w, **stub_wall()),
        add("object", desk, **stub_desk(admin_editing_new_floor)),
    )
    await publish(admin_editing_new_floor, 1)
    await apply(
        admin_editing_new_floor,
        0,
        {"op": "update", "kind": "object", "id": str(desk), "data": {"position": [4000, 1000, 0]}},
        {"op": "delete", "kind": "wall", "id": str(w)},
    )
    await publish(admin_editing_new_floor, 1)  # v2: desk moved, wall gone

    await publishing(admin_editing_new_floor).restore(admin_editing_new_floor["floor"], 1)
    v1, v3 = await plan(admin_editing_new_floor, 1), await plan(admin_editing_new_floor, 3)
    assert v3.model_dump() == v1.model_dump()  # same elements, same ids, same geometry
    assert (await plan(admin_editing_new_floor, 2)).walls == []  # v2 untouched
    with pytest.raises(ProblemException) as exc:
        await publishing(admin_editing_new_floor).restore(admin_editing_new_floor["floor"], 1)
    assert exc.value.slug == "draft-exists"  # never overwrite unsaved work


async def test_publish_conflicts_labels_devices_and_assignments(
    admin_editing_new_floor: dict[str, Any],
) -> None:
    rolled_back_db_session, tenant = (
        admin_editing_new_floor["db"],
        admin_editing_new_floor["tenant"],
    )
    # Another floor in the same building already publishes seat "A-01" and a device.
    other, _ = await make_floor(
        rolled_back_db_session, tenant, admin_editing_new_floor["building"], level=1
    )
    await lock(rolled_back_db_session, tenant, other)
    device = models.Device(id=new_id(), tenant_id=tenant, asset_tag=f"MON-{new_id().hex[:5]}")
    rolled_back_db_session.add(device)
    await rolled_back_db_session.flush()
    await apply(
        admin_editing_new_floor,
        0,
        add(
            "object",
            new_id(),
            **stub_desk(admin_editing_new_floor, label="A-01", device_id=str(device.id)),
        ),
        floor=other,
    )
    await publish(admin_editing_new_floor, 1, floor=other)

    seat = new_id()
    await apply(
        admin_editing_new_floor,
        0,
        add("object", seat, **stub_desk(admin_editing_new_floor, label="A-01")),
        add(
            "object",
            new_id(),
            **stub_desk(admin_editing_new_floor, x=3000, label="A-02", device_id=str(device.id)),
        ),
    )
    with pytest.raises(ProblemException) as exc:
        await publish(admin_editing_new_floor, 1)
    assert exc.value.slug == "publish-conflicts"
    assert sorted(e.code for e in exc.value.errors or []) == [
        "device_on_other_floor",
        "seat_label_duplicate",
    ]


async def test_publishing_frees_assigned_seats_it_removes(
    admin_editing_new_floor: dict[str, Any],
) -> None:
    seat = new_id()
    await apply(
        admin_editing_new_floor, 0, add("object", seat, **stub_desk(admin_editing_new_floor))
    )
    await publish(admin_editing_new_floor, 1)
    person = (
        await admin_editing_new_floor["db"].execute(
            text(
                "INSERT INTO person (id, tenant_id, display_name, email, source, active, "
                "created_at, updated_at) "
                "VALUES (:id, :t, 'Dana', :e, 'manual', true, now(), now()) RETURNING id"
            ),
            {
                "id": new_id(),
                "t": admin_editing_new_floor["tenant"],
                "e": f"dana-{new_id().hex[:6]}@hsp.local",
            },
        )
    ).scalar_one()
    admin_editing_new_floor["db"].add(
        models.SeatAssignment(
            id=new_id(),
            tenant_id=admin_editing_new_floor["tenant"],
            seat_element_id=seat,
            holder_person_id=person,
            assigned_by="alice",
        )
    )
    await admin_editing_new_floor["db"].flush()
    await apply(admin_editing_new_floor, 0, {"op": "delete", "kind": "object", "id": str(seat)})
    # docs/0086: publishing frees the seat in the same transaction, audited and reported.
    result = await publish(admin_editing_new_floor, 1)
    assert result.published_version == 2
    assert [(f.seat_id, f.holder_person_id) for f in result.freed_seats] == [(seat, person)]
    rolled_back_db_session = admin_editing_new_floor["db"]
    assert (
        await rolled_back_db_session.scalar(
            select(models.SeatAssignment).where(models.SeatAssignment.seat_element_id == seat)
        )
        is None
    )
    event = await rolled_back_db_session.scalar(
        select(models.AuditEvent).where(
            models.AuditEvent.action == "seat.unassigned", models.AuditEvent.entity_id == seat
        )
    )
    assert event is not None and event.before == {
        "holder_person_id": str(person),
        "holder_unit_id": None,
    }
