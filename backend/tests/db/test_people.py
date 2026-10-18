"""People and memberships against PostgreSQL (docs/0017, docs/0023, docs/0084)."""

from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.models import new_id
from hsp.org.people import MembershipIn, PeopleService, PersonIn
from hsp.org.units import PositionIn, UnitIn, UnitsService
from hsp.problems import ProblemException
from tests.db.plan_helpers import new_tenant
from tests.stubs import stub_admin


@pytest.fixture
async def own_tenant_with_web_team(rolled_back_db_session: AsyncSession) -> dict[str, Any]:
    """A tenant of its own with Company > Engineering > Web, a Team Lead position in Web, and
    the people service as its admin."""
    tenant = await new_tenant(rolled_back_db_session)
    admin = stub_admin(tenant, "a", "A")
    units = UnitsService(rolled_back_db_session, admin)
    root = await units.create(UnitIn(name="Company"))
    eng = await units.create(UnitIn(name="Engineering", parent_id=root.id))
    web = await units.create(UnitIn(name="Web", parent_id=eng.id))
    lead = await units.create_position(web.id, PositionIn(title="Team Lead"))
    return {
        "people": PeopleService(rolled_back_db_session, admin),
        "root": root,
        "eng": eng,
        "web": web,
        "lead": lead,
    }


async def test_create_lowercases_email_and_enforces_uniqueness(
    own_tenant_with_web_team: dict[str, Any],
) -> None:
    s: PeopleService = own_tenant_with_web_team["people"]
    dana = await s.create(PersonIn(display_name="Dana Cohen", email="Dana.Cohen@Example.com"))
    assert dana.email == "dana.cohen@example.com"
    with pytest.raises(ProblemException) as exc:
        await s.create(PersonIn(display_name="Other", email="DANA.COHEN@example.com"))
    assert exc.value.slug == "email-taken"
    assert [
        p.id
        for p in await s.list_people(
            q="cohen", unit_id=None, include_inactive=False, after=None, limit=10
        )
    ] == [dana.id]


async def test_deactivate_hides_and_reactivate_returns(
    own_tenant_with_web_team: dict[str, Any],
) -> None:
    s: PeopleService = own_tenant_with_web_team["people"]
    p = await s.create(PersonIn(display_name="Eli", email="eli@example.com"))
    assert (await s.set_active(p.id, False)).active is False
    assert (
        await s.list_people(q="eli", unit_id=None, include_inactive=False, after=None, limit=10)
        == []
    )
    assert (
        len(await s.list_people(q="eli", unit_id=None, include_inactive=True, after=None, limit=10))
        == 1
    )
    assert (await s.set_active(p.id, True)).active is True


async def test_primary_must_be_marked_with_several_units(
    own_tenant_with_web_team: dict[str, Any],
) -> None:
    s: PeopleService = own_tenant_with_web_team["people"]
    p = await s.create(PersonIn(display_name="Noa", email="noa@example.com"))
    with pytest.raises(ProblemException) as exc:
        await s.set_memberships(
            p.id,
            [
                MembershipIn(unit_id=own_tenant_with_web_team["root"].id),
                MembershipIn(unit_id=own_tenant_with_web_team["web"].id),
            ],
        )
    assert [e.code for e in exc.value.errors or []] == ["primary_required"]  # docs/0084
    alone = await s.set_memberships(
        p.id, [MembershipIn(unit_id=own_tenant_with_web_team["web"].id)]
    )
    assert (
        alone.primary_unit_id == own_tenant_with_web_team["web"].id
    )  # a lone membership is primary by itself
    assert not any(m.primary_override for m in alone.memberships)
    chosen = await s.set_memberships(
        p.id,
        [
            MembershipIn(unit_id=own_tenant_with_web_team["root"].id, is_primary=True),
            MembershipIn(
                unit_id=own_tenant_with_web_team["web"].id,
                position_id=own_tenant_with_web_team["lead"].id,
            ),
        ],
    )
    assert chosen.primary_unit_id == own_tenant_with_web_team["root"].id
    assert [m.primary_override for m in chosen.memberships if m.is_primary] == [True]
    members_of_web = await s.list_people(
        q=None,
        unit_id=own_tenant_with_web_team["web"].id,
        include_inactive=False,
        after=None,
        limit=10,
    )
    assert [x.id for x in members_of_web] == [p.id]  # secondary memberships count too
    assert (await s.set_memberships(p.id, [])).primary_unit_id is None


async def test_invalid_memberships_are_refused_whole(
    own_tenant_with_web_team: dict[str, Any],
) -> None:
    s: PeopleService = own_tenant_with_web_team["people"]
    p = await s.create(PersonIn(display_name="Ori", email="ori@example.com"))
    with pytest.raises(ProblemException) as exc:
        await s.set_memberships(
            p.id,
            [
                MembershipIn(unit_id=own_tenant_with_web_team["eng"].id, is_primary=True),
                MembershipIn(unit_id=own_tenant_with_web_team["web"].id, is_primary=True),
                MembershipIn(
                    unit_id=own_tenant_with_web_team["eng"].id,
                    position_id=own_tenant_with_web_team["lead"].id,
                ),  # duplicate unit, wrong position
                MembershipIn(unit_id=new_id()),
            ],
        )
    codes = sorted(e.code for e in exc.value.errors or [])
    assert codes == ["duplicate_unit", "multiple_primary", "position_mismatch", "unit_not_found"]
    assert (await s.get(p.id)).memberships == []  # nothing applied
