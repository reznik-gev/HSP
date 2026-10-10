"""People and their unit memberships (docs/0006, 0017, 0023, 0084).

`DELETE` deactivates (people are never deleted, docs/0017). Memberships are replaced as a whole
list so "at most one primary" can never be violated half-way. Without an explicit primary, the
deepest unit is primary (docs/0023); an explicit choice is stored as an override.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.audit import audit_event, changed_fields
from hsp.auth.principal import Principal
from hsp.problems import ProblemError, ProblemException

PERSON_FIELDS = ("display_name", "email", "title", "external_id")


class PersonIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    title: str | None = Field(default=None, max_length=200)
    external_id: str | None = Field(default=None, max_length=255)


class PersonPatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    title: str | None = Field(default=None, max_length=200)
    external_id: str | None = Field(default=None, max_length=255)


class MembershipIn(BaseModel):
    unit_id: uuid.UUID
    position_id: uuid.UUID | None = None
    is_primary: bool = False


class MembershipOut(BaseModel):
    unit_id: uuid.UUID
    position_id: uuid.UUID | None
    is_primary: bool
    primary_override: bool = Field(
        description="Primary chosen explicitly, not by the deepest-unit rule"
    )


class PersonOut(BaseModel):
    id: uuid.UUID
    display_name: str
    email: str
    title: str | None
    external_id: str | None
    active: bool
    source: str
    primary_unit_id: uuid.UUID | None
    memberships: list[MembershipOut]


def _snapshot(p: models.Person) -> dict[str, Any]:
    return {f: getattr(p, f) for f in PERSON_FIELDS} | {"active": p.active}


@dataclass
class PeopleService:
    db: AsyncSession
    principal: Principal
    request_id: str | None = None

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    def _audit(
        self, action: str, person_id: uuid.UUID, before: Any = None, after: Any = None
    ) -> None:
        self.db.add(
            audit_event(
                self.principal,
                action=action,
                entity_type="person",
                entity_id=person_id,
                before=before,
                after=after,
                request_id=self.request_id,
            )
        )

    async def _memberships(
        self, person_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[MembershipOut]]:
        out: dict[uuid.UUID, list[MembershipOut]] = {pid: [] for pid in person_ids}
        if person_ids:
            rows = await self.db.scalars(
                select(models.UnitMembership)
                .where(models.UnitMembership.person_id.in_(person_ids))
                .order_by(models.UnitMembership.unit_id)
            )
            for m in rows:
                out[m.person_id].append(
                    MembershipOut(
                        unit_id=m.unit_id,
                        position_id=m.position_id,
                        is_primary=m.is_primary,
                        primary_override=m.primary_override,
                    )
                )
        return out

    async def _out(self, people: list[models.Person]) -> list[PersonOut]:
        members = await self._memberships([p.id for p in people])
        result = []
        for p in people:
            ms = members[p.id]
            primary = next((m.unit_id for m in ms if m.is_primary), None)
            result.append(
                PersonOut(
                    id=p.id,
                    active=p.active,
                    source=p.source.value,
                    primary_unit_id=primary,
                    memberships=ms,
                    **{f: getattr(p, f) for f in PERSON_FIELDS},
                )
            )
        return result

    async def get_person(self, person_id: uuid.UUID) -> models.Person:
        p = await self.db.scalar(
            select(models.Person).where(
                models.Person.tenant_id == self._tenant, models.Person.id == person_id
            )
        )
        if p is None:
            raise ProblemException(
                404, "not-found", "Not found", f"Person {person_id} does not exist."
            )
        return p

    async def get(self, person_id: uuid.UUID) -> PersonOut:
        return (await self._out([await self.get_person(person_id)]))[0]

    async def list_people(
        self,
        *,
        q: str | None,
        unit_id: uuid.UUID | None,
        include_inactive: bool,
        after: uuid.UUID | None,
        limit: int,
    ) -> list[PersonOut]:
        query = select(models.Person).where(models.Person.tenant_id == self._tenant)
        if q:
            pattern = f"%{q.replace('%', r'\%').replace('_', r'\_')}%"
            query = query.where(
                or_(models.Person.display_name.ilike(pattern), models.Person.email.ilike(pattern))
            )
        if unit_id is not None:
            query = query.where(
                models.Person.id.in_(
                    select(models.UnitMembership.person_id).where(
                        models.UnitMembership.unit_id == unit_id
                    )
                )
            )
        if not include_inactive:
            query = query.where(models.Person.active.is_(True))
        if after is not None:
            query = query.where(models.Person.id > after)
        return await self._out(
            list(await self.db.scalars(query.order_by(models.Person.id).limit(limit)))
        )

    async def _ensure_unique(
        self, email: str | None, external_id: str | None, own: uuid.UUID | None
    ) -> None:
        if email:
            clash = await self.db.scalar(
                select(models.Person.id).where(
                    models.Person.tenant_id == self._tenant,
                    func.lower(models.Person.email) == email,
                )
            )
            if clash is not None and clash != own:
                raise ProblemException(
                    409, "email-taken", "Email already used", f"{email} belongs to someone else."
                )
        if external_id:
            clash = await self.db.scalar(
                select(models.Person.id).where(
                    models.Person.tenant_id == self._tenant,
                    models.Person.external_id == external_id,
                )
            )
            if clash is not None and clash != own:
                raise ProblemException(
                    409,
                    "external-id-taken",
                    "External id already used",
                    f"Another person has external id {external_id!r}.",
                )

    async def create(
        self, body: PersonIn, source: models.RecordSource = models.RecordSource.MANUAL
    ) -> PersonOut:
        values = body.model_dump()
        values["email"] = values["email"].lower()  # docs/0084: case never matters
        await self._ensure_unique(values["email"], values["external_id"], None)
        now = datetime.now(UTC)
        p = models.Person(
            id=models.new_id(),
            tenant_id=self._tenant,
            source=source,
            active=True,
            created_at=now,
            updated_at=now,
            **values,
        )
        self.db.add(p)
        self._audit("person.created", p.id, after=values)
        await self.db.commit()
        return (await self._out([p]))[0]

    async def update(self, person_id: uuid.UUID, changes: dict[str, Any]) -> PersonOut:
        p = await self.get_person(person_id)
        if changes.get("email"):
            changes["email"] = changes["email"].lower()
        await self._ensure_unique(changes.get("email"), changes.get("external_id"), p.id)
        before = _snapshot(p)
        for k, v in changes.items():
            if k in PERSON_FIELDS:
                setattr(p, k, v)
        b, a = changed_fields(before, _snapshot(p))
        if a:
            p.updated_at = datetime.now(UTC)
            self._audit("person.updated", p.id, b, a)
            await self.db.commit()
        return (await self._out([p]))[0]

    async def set_active(self, person_id: uuid.UUID, active: bool) -> PersonOut:
        p = await self.get_person(person_id)
        if p.active != active:
            p.active, p.updated_at = active, datetime.now(UTC)
            self._audit(
                "person.reactivated" if active else "person.deactivated",
                p.id,
                {"active": not active},
                {"active": active},
            )
            await self.db.commit()
        return (await self._out([p]))[0]

    async def _unit_depths(self) -> dict[uuid.UUID, int]:
        rows = (
            await self.db.execute(
                select(models.OrgUnit.id, models.OrgUnit.parent_id).where(
                    models.OrgUnit.tenant_id == self._tenant
                )
            )
        ).all()
        parent = {uid: pid for uid, pid in rows}
        depth: dict[uuid.UUID, int] = {}

        def d(uid: uuid.UUID) -> int:
            if uid not in depth:
                p = parent.get(uid)
                depth[uid] = 0 if p is None else d(p) + 1
            return depth[uid]

        for uid in parent:
            d(uid)
        return depth

    async def set_memberships(self, person_id: uuid.UUID, wanted: list[MembershipIn]) -> PersonOut:
        p = await self.get_person(person_id)
        errors: list[ProblemError] = []
        unit_ids = [m.unit_id for m in wanted]
        if len(set(unit_ids)) != len(unit_ids):
            errors.append(ProblemError(code="duplicate_unit", message="A unit is listed twice."))
        if sum(m.is_primary for m in wanted) > 1:
            errors.append(
                ProblemError(code="multiple_primary", message="Only one membership can be primary.")
            )
        units = (
            {
                u.id: u
                for u in await self.db.scalars(
                    select(models.OrgUnit).where(
                        models.OrgUnit.tenant_id == self._tenant, models.OrgUnit.id.in_(unit_ids)
                    )
                )
            }
            if unit_ids
            else {}
        )
        position_ids = [m.position_id for m in wanted if m.position_id]
        positions = (
            {
                x.id: x
                for x in await self.db.scalars(
                    select(models.Position).where(
                        models.Position.tenant_id == self._tenant,
                        models.Position.id.in_(position_ids),
                    )
                )
            }
            if position_ids
            else {}
        )
        for i, m in enumerate(wanted):
            unit = units.get(m.unit_id)
            if unit is None:
                errors.append(
                    ProblemError(
                        code="unit_not_found",
                        message=f"Org unit {m.unit_id} does not exist.",
                        pointer=f"/{i}/unit_id",
                    )
                )
            elif unit.archived_at is not None:
                errors.append(
                    ProblemError(
                        code="unit_archived",
                        message=f"{unit.name} is archived.",
                        pointer=f"/{i}/unit_id",
                    )
                )
            if m.position_id:
                pos = positions.get(m.position_id)
                if pos is None or pos.unit_id != m.unit_id:
                    errors.append(
                        ProblemError(
                            code="position_mismatch",
                            pointer=f"/{i}/position_id",
                            message="The position doesn't exist in that unit.",
                        )
                    )
        if errors:
            raise ProblemException(422, "request-invalid", "Invalid memberships", errors=errors)

        explicit = next((m.unit_id for m in wanted if m.is_primary), None)
        primary = explicit
        if primary is None and wanted:  # docs/0023: deepest unit; ties -> lowest id
            depths = await self._unit_depths()
            primary = max(unit_ids, key=lambda u: (depths.get(u, 0), -u.int))
        before = [m.model_dump(mode="json") for m in (await self._memberships([p.id]))[p.id]]
        await self.db.execute(
            delete(models.UnitMembership).where(models.UnitMembership.person_id == p.id)
        )
        await self.db.flush()  # free the "one primary" index before inserting the new set
        for m in wanted:
            self.db.add(
                models.UnitMembership(
                    person_id=p.id,
                    unit_id=m.unit_id,
                    tenant_id=self._tenant,
                    position_id=m.position_id,
                    is_primary=m.unit_id == primary,
                    primary_override=explicit is not None and m.unit_id == explicit,
                )
            )
        await self.db.flush()
        after = [m.model_dump(mode="json") for m in (await self._memberships([p.id]))[p.id]]
        if before != after:
            self._audit(
                "person.memberships_changed", p.id, {"memberships": before}, {"memberships": after}
            )
        await self.db.commit()
        return (await self._out([p]))[0]
