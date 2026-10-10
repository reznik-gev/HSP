"""SqlLockRepository against PostgreSQL: the atomic acquire upsert (docs/0016).

Includes a real race between two connections: exactly one editor may win.
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession

from hsp import models
from hsp.locations.repository import SqlLocationsRepository
from hsp.models import new_id
from hsp.plans.locks import SqlLockRepository


async def _floor(db: AsyncSession) -> tuple[uuid.UUID, uuid.UUID]:
    tenant = (await db.execute(text("SELECT id FROM tenant WHERE slug = 'default'"))).scalar_one()
    now = datetime.now(UTC)
    site = models.Site(
        id=new_id(), tenant_id=tenant, name="HQ", time_zone="UTC", created_at=now, updated_at=now
    )
    building = models.Building(
        id=new_id(),
        tenant_id=tenant,
        site_id=site.id,
        name="B",
        code=f"B{new_id().hex[:6]}",
        created_at=now,
        updated_at=now,
    )
    floor = models.Floor(
        id=new_id(),
        tenant_id=tenant,
        building_id=building.id,
        name="G",
        level_index=0,
        elevation_mm=0,
        default_wall_height_mm=2800,
        origin_x_mm=0,
        origin_y_mm=0,
        created_at=now,
        updated_at=now,
    )
    for row in (site, building, floor):  # no ORM relationships: flush parents first
        db.add(row)
        await db.flush()
    return tenant, floor.id


async def test_acquire_heartbeat_block_takeover(conn: AsyncConnection) -> None:
    db = AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    tenant, floor = await _floor(db)
    repo = SqlLockRepository(db)
    t0 = datetime.now(UTC)
    ttl = timedelta(minutes=15)

    a = await repo.try_acquire(
        tenant, floor, subject="alice", name="Alice", now=t0, expires_at=t0 + ttl
    )
    assert a is not None and a.holder_subject == "alice"

    t1 = t0 + timedelta(minutes=1)  # heartbeat: extended, original start kept
    a2 = await repo.try_acquire(
        tenant, floor, subject="alice", name="Alice", now=t1, expires_at=t1 + ttl
    )
    assert a2 is not None and a2.acquired_at == a.acquired_at and a2.expires_at == t1 + ttl

    blocked = await repo.try_acquire(
        tenant, floor, subject="bob", name="Bob", now=t1, expires_at=t1 + ttl
    )
    assert blocked is None
    assert (await repo.get(tenant, floor)).holder_subject == "alice"  # type: ignore[union-attr]
    assert await SqlLocationsRepository(db).lock_holder(tenant, floor, t1) == "Alice"

    t_late = t1 + ttl + timedelta(seconds=1)  # Alice's lock expired: Bob takes over
    b = await repo.try_acquire(
        tenant, floor, subject="bob", name="Bob", now=t_late, expires_at=t_late + ttl
    )
    assert b is not None and (b.holder_subject, b.acquired_at) == ("bob", t_late)
    assert (
        await SqlLocationsRepository(db).lock_holder(tenant, floor, t_late + ttl) is None
    )  # expired = free

    t_back = t_late + ttl + timedelta(seconds=1)  # same holder after expiry: a NEW session
    b2 = await repo.try_acquire(
        tenant, floor, subject="bob", name="Bob", now=t_back, expires_at=t_back + ttl
    )
    assert b2 is not None and b2.acquired_at == t_back

    await repo.delete(tenant, floor)
    assert await repo.get(tenant, floor) is None


async def test_two_editors_racing_only_one_wins(engine: AsyncEngine) -> None:
    async with AsyncSession(engine, expire_on_commit=False) as setup:
        tenant, floor = await _floor(setup)
        await setup.commit()
    try:
        now = datetime.now(UTC)

        async def contender(subject: str) -> bool:
            async with AsyncSession(engine, expire_on_commit=False) as db:
                won = await SqlLockRepository(db).try_acquire(
                    tenant,
                    floor,
                    subject=subject,
                    name=subject,
                    now=now,
                    expires_at=now + timedelta(minutes=15),
                )
                await db.commit()
                return won is not None

        results = await asyncio.gather(*(contender(f"editor-{i}") for i in range(8)))
        assert sum(results) == 1  # exactly one winner, whoever got there first
    finally:
        async with engine.begin() as c:  # this test commits for real, so clean up
            await c.execute(text("DELETE FROM floor_edit_lock WHERE floor_id = :f"), {"f": floor})
            await c.execute(text("DELETE FROM floor WHERE id = :f"), {"f": floor})
