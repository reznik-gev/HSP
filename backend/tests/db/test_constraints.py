"""DB-enforced invariants that mocks cannot verify (docs/0061 items 1-4)."""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection
from uuid_utils.compat import uuid7


async def _floor_with_wall_element(conn: AsyncConnection) -> tuple[uuid.UUID, uuid.UUID]:
    tenant_id = (
        await conn.execute(text("SELECT id FROM tenant WHERE slug = 'default'"))
    ).scalar_one()
    site, building, floor, element = uuid7(), uuid7(), uuid7(), uuid7()
    await conn.execute(
        text("INSERT INTO site (id, tenant_id, name, time_zone) VALUES (:id, :t, 'HQ', 'UTC')"),
        {"id": site, "t": tenant_id},
    )
    await conn.execute(
        text(
            "INSERT INTO building (id, tenant_id, site_id, name, code) "
            "VALUES (:id, :t, :s, 'Main', 'A')"
        ),
        {"id": building, "t": tenant_id, "s": site},
    )
    await conn.execute(
        text(
            "INSERT INTO floor (id, tenant_id, building_id, name, level_index, elevation_mm, "
            "default_wall_height_mm, origin_x_mm, origin_y_mm) "
            "VALUES (:id, :t, :b, 'Ground', 0, 0, 2800, 0, 0)"
        ),
        {"id": floor, "t": tenant_id, "b": building},
    )
    await conn.execute(
        text(
            "INSERT INTO floor_element (id, tenant_id, floor_id, kind) VALUES (:id, :t, :f, 'wall')"
        ),
        {"id": element, "t": tenant_id, "f": floor},
    )
    return tenant_id, element


async def _insert_wall_rev(
    conn: AsyncConnection,
    tenant_id: uuid.UUID,
    element: uuid.UUID,
    from_v: int,
    to_v: int | None,
    wkt: str = "LINESTRING(0 0, 12000 0)",
) -> None:
    await conn.execute(
        text(
            "INSERT INTO wall_rev (id, tenant_id, element_id, from_version, to_version, "
            "centerline, thickness_mm, height_mm) "
            "VALUES (:id, :t, :e, :fv, :tv, ST_GeomFromText(:wkt), 150, 2800)"
        ),
        {"id": uuid7(), "t": tenant_id, "e": element, "fv": from_v, "tv": to_v, "wkt": wkt},
    )


async def test_seed_data_present(conn: AsyncConnection) -> None:
    builtins = await conn.execute(text("SELECT count(*) FROM catalog_item WHERE tenant_id IS NULL"))
    assert builtins.scalar_one() >= 10


async def test_adjacent_version_ranges_are_allowed(conn: AsyncConnection) -> None:
    tenant_id, element = await _floor_with_wall_element(conn)
    await _insert_wall_rev(conn, tenant_id, element, 1, 3)
    await _insert_wall_rev(conn, tenant_id, element, 3, None)  # [1,3) then [3,inf): no overlap


async def test_overlapping_version_ranges_are_rejected(conn: AsyncConnection) -> None:
    """docs/0028: never two revisions of one element valid in the same version."""
    tenant_id, element = await _floor_with_wall_element(conn)
    await _insert_wall_rev(conn, tenant_id, element, 1, None)
    with pytest.raises(IntegrityError, match="ex_wall_rev_version_overlap"):
        async with conn.begin_nested():
            await _insert_wall_rev(conn, tenant_id, element, 2, None)


async def test_inverted_version_range_is_rejected(conn: AsyncConnection) -> None:
    tenant_id, element = await _floor_with_wall_element(conn)
    with pytest.raises(IntegrityError, match="ck_wall_rev_version_range"):
        async with conn.begin_nested():
            await _insert_wall_rev(conn, tenant_id, element, 3, 2)


async def test_off_grid_geometry_is_rejected(conn: AsyncConnection) -> None:
    """docs/0029: every coordinate is a whole millimetre."""
    tenant_id, element = await _floor_with_wall_element(conn)
    with pytest.raises(IntegrityError, match="ck_wall_rev_centerline_on_grid"):
        async with conn.begin_nested():
            await _insert_wall_rev(conn, tenant_id, element, 1, None, "LINESTRING(0 0, 1000.5 0)")


async def test_seat_assignment_needs_exactly_one_holder(conn: AsyncConnection) -> None:
    """docs/0031: holder is a person XOR a unit."""
    tenant_id, element = await _floor_with_wall_element(conn)
    with pytest.raises(IntegrityError, match="ck_seat_assignment_exactly_one_holder"):
        async with conn.begin_nested():
            await conn.execute(
                text(
                    "INSERT INTO seat_assignment (id, tenant_id, seat_element_id, assigned_by) "
                    "VALUES (:id, :t, :e, 'test')"
                ),
                {"id": uuid7(), "t": tenant_id, "e": element},
            )
