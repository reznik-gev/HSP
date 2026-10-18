"""CSV/Excel import against PostgreSQL (docs/0027, docs/0084): dry run vs apply, idempotent
re-imports, all-or-nothing errors, memberships and positions."""

import io
from typing import Any

import pytest
from openpyxl import Workbook
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.imports import read_table
from hsp.org.imports import ImportService
from hsp.problems import ProblemException
from tests.db.plan_helpers import new_tenant
from tests.stubs import stub_admin

UNITS_CSV = b"""external_id,name,parent_external_id,level_label,shoe_size
CO,Company,,Company,
ENG,Engineering,CO,Division,
WEB,Web,ENG,Team,
"""


def xlsx(rows: list[list[Any]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


PEOPLE = [
    [
        "email",
        "display_name",
        "external_id",
        "primary_unit_external_id",
        "secondary_unit_external_ids",
        "position",
    ],
    ["Dana@Example.com", "Dana Cohen", "E1", "WEB", "ENG", "Team Lead"],
    ["eli@example.com", "Eli Levi", "", "ENG", "", ""],
]


@pytest.fixture
async def import_service_in_own_tenant(rolled_back_db_session: AsyncSession) -> ImportService:
    tenant = await new_tenant(rolled_back_db_session)
    return ImportService(
        rolled_back_db_session,
        stub_admin(tenant, "a", "A"),
    )


async def count(import_service_in_own_tenant: ImportService, model: Any) -> int:
    return int(
        await import_service_in_own_tenant.db.scalar(
            select(func.count())
            .select_from(model)
            .where(model.tenant_id == import_service_in_own_tenant.principal.tenant_id)
        )
        or 0
    )


async def test_units_dry_run_then_apply_then_idempotent(
    import_service_in_own_tenant: ImportService,
) -> None:
    rows = read_table("units.csv", UNITS_CSV)
    preview = await import_service_in_own_tenant.import_units(rows, apply=False)
    assert (preview.applied, preview.created, preview.errors) == (False, 3, [])
    assert [w.params for w in preview.warnings] == [{"columns": "shoe_size"}]
    assert await count(import_service_in_own_tenant, models.OrgUnit) == 0  # dry run wrote nothing

    done = await import_service_in_own_tenant.import_units(rows, apply=True)
    assert (done.applied, done.created) == (True, 3)
    again = await import_service_in_own_tenant.import_units(
        read_table("units.csv", UNITS_CSV), apply=True
    )
    assert (again.created, again.updated, again.unchanged) == (0, 0, 3)  # idempotent re-import


async def test_units_errors_are_reported_per_row_and_nothing_is_written(
    import_service_in_own_tenant: ImportService,
) -> None:
    bad = b"external_id,name,parent_external_id\nCO,Company,\nX,,CO\nY,Y,NOPE\nZ,Z,\nCO,Again,\n"
    report = await import_service_in_own_tenant.import_units(read_table("u.csv", bad), apply=True)
    assert report.applied is False
    assert sorted((e.row, e.code) for e in report.errors) == [
        (3, "required"),
        (4, "parent_not_found"),
        (5, "second_root"),
        (6, "duplicate_row"),
    ]
    # Clients translate the code; params carry the values to show (e.g. in Hebrew).
    params = {e.code: e.params for e in report.errors}
    assert params["parent_not_found"] == {"value": "NOPE"}
    assert params["duplicate_row"] == {"value": "CO", "other_row": "2"}
    assert await count(import_service_in_own_tenant, models.OrgUnit) == 0


async def test_people_from_excel_with_memberships_and_positions(
    import_service_in_own_tenant: ImportService,
) -> None:
    await import_service_in_own_tenant.import_units(read_table("units.csv", UNITS_CSV), apply=True)
    report = await import_service_in_own_tenant.import_people(
        read_table("people.xlsx", xlsx(PEOPLE)), apply=True
    )
    assert (report.created, report.positions_created, report.errors) == (2, 1, [])

    dana = await import_service_in_own_tenant.db.scalar(
        select(models.Person).where(models.Person.email == "dana@example.com")
    )
    assert (
        dana is not None and dana.external_id == "E1" and dana.source == models.RecordSource.IMPORT
    )
    memberships = list(
        await import_service_in_own_tenant.db.scalars(
            select(models.UnitMembership).where(models.UnitMembership.person_id == dana.id)
        )
    )
    assert sorted(m.is_primary for m in memberships) == [False, True]
    assert sum(m.position_id is not None for m in memberships) == 1

    # Re-import: matched by external id (E1) and by email (eli); nothing changes.
    again = await import_service_in_own_tenant.import_people(
        read_table("people.xlsx", xlsx(PEOPLE)), apply=True
    )
    assert (again.created, again.updated, again.unchanged, again.positions_created) == (0, 0, 2, 0)


async def test_people_errors_and_reactivation(import_service_in_own_tenant: ImportService) -> None:
    await import_service_in_own_tenant.import_units(read_table("units.csv", UNITS_CSV), apply=True)
    await import_service_in_own_tenant.import_people(read_table("p.xlsx", xlsx(PEOPLE)), apply=True)
    eli = await import_service_in_own_tenant.db.scalar(
        select(models.Person).where(models.Person.email == "eli@example.com")
    )
    assert eli is not None
    eli.active = False
    await import_service_in_own_tenant.db.commit()

    report = await import_service_in_own_tenant.import_people(
        read_table("p.xlsx", xlsx(PEOPLE)), apply=True
    )
    assert report.reactivated == 1  # being in the HR export means active again

    bad = xlsx(
        [
            PEOPLE[0],
            ["not-an-email", "X", "", "", "", ""],
            ["z@example.com", "Z", "", "MARS", "", "Boss"],
            ["dana@example.com", "Dana", "E2", "", "", ""],
            ["y@example.com", "Y", "", "", "ENG", ""],
        ]
    )
    report = await import_service_in_own_tenant.import_people(
        read_table("bad.xlsx", bad), apply=True
    )
    # Dana already has external id E1: a row re-keying her to E2 is an identity conflict.
    assert sorted(e.code for e in report.errors) == [
        "identity_conflict",
        "invalid_email",
        "primary_required",
        "unit_not_found",
    ]
    assert report.applied is False


def test_unsupported_and_unreadable_files() -> None:
    with pytest.raises(ProblemException) as exc:
        read_table("people.pdf", b"%PDF")
    assert exc.value.status == 415
    with pytest.raises(ProblemException) as exc:
        read_table("people.csv", b"\xff\xfe\x00bad")
    assert exc.value.slug == "import-unreadable"
