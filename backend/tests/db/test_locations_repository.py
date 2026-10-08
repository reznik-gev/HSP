"""SqlLocationsRepository against PostgreSQL: pagination, archive filter, tenant scoping and
active-children lookup (docs/0061 items 6)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from hsp.locations.repository import SqlLocationsRepository
from hsp.models import Building, Site, Tenant, new_id


async def _tenant(db: AsyncSession, slug: str) -> uuid.UUID:
    if slug == "default":
        return (await db.execute(text("SELECT id FROM tenant WHERE slug = 'default'"))).scalar_one()
    t = Tenant(id=new_id(), name=slug, slug=slug)
    db.add(t)
    await db.flush()
    return t.id


def _site(tenant_id: uuid.UUID, name: str, archived: bool = False) -> Site:
    now = datetime.now(UTC)
    return Site(
        id=new_id(),
        tenant_id=tenant_id,
        name=name,
        address=None,
        time_zone="UTC",
        created_at=now,
        updated_at=now,
        archived_at=now if archived else None,
    )


async def test_list_sites_pages_filters_and_scopes(conn: AsyncConnection) -> None:
    db = AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    repo = SqlLocationsRepository(db)
    mine, theirs = await _tenant(db, "default"), await _tenant(db, "other")
    sites = [_site(mine, f"S{i}") for i in range(5)]
    for s in [*sites, _site(mine, "old", archived=True), _site(theirs, "foreign")]:
        repo.add(s)
    await repo.commit()

    first = await repo.list_sites(mine, include_archived=False, after=None, limit=2)
    rest = await repo.list_sites(mine, include_archived=False, after=first[-1].id, limit=10)
    assert [s.name for s in first + rest] == [s.name for s in sites]  # UUIDv7 order = creation
    with_archived = await repo.list_sites(mine, include_archived=True, after=None, limit=10)
    assert {s.name for s in with_archived} == {*(s.name for s in sites), "old"}
    assert await repo.get_site(mine, sites[0].id) is not None
    assert await repo.get_site(theirs, sites[0].id) is None  # tenant scoping


async def test_active_buildings(conn: AsyncConnection) -> None:
    db = AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    repo = SqlLocationsRepository(db)
    tenant = await _tenant(db, "default")
    site = _site(tenant, "HQ")
    repo.add(site)
    await repo.commit()
    now = datetime.now(UTC)
    for code, archived in (("A", False), ("B", True)):
        repo.add(
            Building(
                id=new_id(),
                tenant_id=tenant,
                site_id=site.id,
                name=code,
                code=code,
                created_at=now,
                updated_at=now,
                archived_at=now if archived else None,
            )
        )
    await repo.commit()
    assert [b.code for b in await repo.active_buildings(tenant, site.id)] == ["A"]
