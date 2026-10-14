"""CSV/Excel import of org units and people (docs/0027, docs/0084). The dry-run / apply flow and
file reading are shared with the other imports (hsp/imports.py)."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.auth.principal import Principal
from hsp.imports import (
    ImportReport,
    ImportRun,
    check_columns,
    finish_import,
)

UNIT_COLUMNS = {"external_id", "name", "parent_external_id", "level_label"}
PEOPLE_COLUMNS = {
    "email",
    "display_name",
    "external_id",
    "title",
    "primary_unit_external_id",
    "secondary_unit_external_ids",
    "position",
}


@dataclass
class ImportService:
    db: AsyncSession
    principal: Principal
    request_id: str | None = None

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    async def _finish(self, run: ImportRun, apply: bool) -> ImportReport:
        return await finish_import(self.db, self.principal, self.request_id, run, apply)

    # Units -----------------------------------------------------------------------------------

    async def import_units(self, rows: list[dict[str, str | None]], apply: bool) -> ImportReport:
        run = ImportRun(ImportReport(kind="units", applied=False, rows=len(rows)))
        if not check_columns(rows, UNIT_COLUMNS, {"external_id", "name"}, run):
            return await self._finish(run, apply)
        existing: dict[str, models.OrgUnit] = {
            u.external_id: u
            for u in await self.db.scalars(
                select(models.OrgUnit).where(models.OrgUnit.tenant_id == self._tenant)
            )
            if u.external_id  # only units with an external id can be referenced by a file
        }
        root = await self.db.scalar(
            select(models.OrgUnit).where(
                models.OrgUnit.tenant_id == self._tenant, models.OrgUnit.parent_id.is_(None)
            )
        )

        wanted: dict[str, dict[str, str | None]] = {}
        for i, r in enumerate(rows, start=2):
            ext, name = r.get("external_id"), r.get("name")
            if not ext:
                run.error(i, "required", "external_id is required.", "external_id")
                continue
            if not name:
                run.error(i, "required", "name is required.", "name")
            if ext in wanted:
                run.error(
                    i,
                    "duplicate_row",
                    f"external_id {ext!r} appears twice (also row {run.row_of[ext]}).",
                    "external_id",
                    value=ext,
                    other_row=run.row_of[ext],
                )
                continue
            wanted[ext], run.row_of[ext] = r, i

        parentless = [e for e, r in wanted.items() if not r.get("parent_external_id")]
        for ext in parentless:
            if root is not None and root.external_id != ext:
                run.error(
                    run.row_of[ext],
                    "second_root",
                    "Only the existing root unit may have no parent.",
                    "parent_external_id",
                )
        if root is None and len(parentless) > 1:
            for ext in parentless[1:]:
                run.error(
                    run.row_of[ext],
                    "second_root",
                    "Exactly one unit (the root) may have no parent.",
                    "parent_external_id",
                )
        for ext, r in wanted.items():
            parent = r.get("parent_external_id")
            if parent and parent not in wanted and parent not in existing:
                run.error(
                    run.row_of[ext],
                    "parent_not_found",
                    f"Unknown parent unit {parent!r}.",
                    "parent_external_id",
                    value=parent,
                )
            if ext in existing and existing[ext].archived_at is not None:
                run.error(
                    run.row_of[ext],
                    "unit_archived",
                    f"Unit {ext!r} is archived; restore it first.",
                    "external_id",
                    value=ext,
                )
        if run.report.errors:
            return await self._finish(run, apply)

        # Resolve the final parent of every unit and refuse cycles across file + database.
        final_parent: dict[str, str | None] = {}
        by_id = {u.id: u for u in existing.values()}
        for e, u in existing.items():
            final_parent[e] = by_id[u.parent_id].external_id if u.parent_id in by_id else None
        for ext, r in wanted.items():
            final_parent[ext] = r.get("parent_external_id")
        for ext in wanted:
            seen, cursor = {ext}, final_parent.get(ext)
            while cursor:
                if cursor in seen:
                    run.error(
                        run.row_of[ext],
                        "unit_cycle",
                        "Parent links form a cycle.",
                        "parent_external_id",
                    )
                    break
                seen.add(cursor)
                cursor = final_parent.get(cursor)
        if run.report.errors:
            return await self._finish(run, apply)

        # Write parents before children (no ORM relationships: explicit flush order).
        now = datetime.now(UTC)
        ids = {e: u.id for e, u in existing.items()}

        def depth(e: str) -> int:
            d, c = 0, final_parent.get(e)
            while c:
                d, c = d + 1, final_parent.get(c)
            return d

        for ext in sorted(wanted, key=depth):
            r = wanted[ext]
            parent_ext = r.get("parent_external_id")
            parent_id = ids[parent_ext] if parent_ext else None
            values = {
                "name": r.get("name"),
                "level_label": r.get("level_label"),
                "parent_id": parent_id,
            }
            unit = existing.get(ext)
            if unit is None:
                unit = models.OrgUnit(
                    id=models.new_id(),
                    tenant_id=self._tenant,
                    external_id=ext,
                    source=models.RecordSource.IMPORT,
                    created_at=now,
                    updated_at=now,
                    archived_at=None,
                    color=None,
                    **values,
                )
                self.db.add(unit)
                ids[ext] = unit.id
                run.report.created += 1
            elif any(getattr(unit, k) != v for k, v in values.items()):
                for k, v in values.items():
                    setattr(unit, k, v)
                unit.updated_at = now
                run.report.updated += 1
            else:
                run.report.unchanged += 1
            await self.db.flush()
        return await self._finish(run, apply)

    # People ----------------------------------------------------------------------------------

    async def import_people(self, rows: list[dict[str, str | None]], apply: bool) -> ImportReport:
        run = ImportRun(ImportReport(kind="people", applied=False, rows=len(rows)))
        if not check_columns(rows, PEOPLE_COLUMNS, {"email", "display_name"}, run):
            return await self._finish(run, apply)
        units: dict[str, models.OrgUnit] = {
            u.external_id: u
            for u in await self.db.scalars(
                select(models.OrgUnit).where(models.OrgUnit.tenant_id == self._tenant)
            )
            if u.external_id  # only units with an external id can be referenced by a file
        }
        people = list(
            await self.db.scalars(
                select(models.Person).where(models.Person.tenant_id == self._tenant)
            )
        )
        by_email = {p.email.lower(): p for p in people}
        by_ext = {p.external_id: p for p in people if p.external_id}

        parsed: list[tuple[int, dict[str, Any]]] = []
        seen_email: dict[str, int] = {}
        seen_ext: dict[str, int] = {}
        for i, r in enumerate(rows, start=2):
            email_raw, name = r.get("email"), r.get("display_name")
            if not email_raw:
                run.error(i, "required", "email is required.", "email")
                continue
            try:
                email = validate_email(email_raw, check_deliverability=False).normalized.lower()
            except EmailNotValidError as exc:
                run.error(i, "invalid_email", str(exc), "email", value=email_raw)
                continue
            if not name:
                run.error(i, "required", "display_name is required.", "display_name")
            ext = r.get("external_id")
            for key, seen, col in ((email, seen_email, "email"), (ext, seen_ext, "external_id")):
                if key and key in seen:
                    run.error(
                        i,
                        "duplicate_row",
                        f"{col} {key!r} appears twice (also row {seen[key]}).",
                        col,
                        value=key,
                        other_row=seen[key],
                    )
                elif key:
                    seen[key] = i
            primary = r.get("primary_unit_external_id")
            secondary = [
                s.strip()
                for s in (r.get("secondary_unit_external_ids") or "").split(";")
                if s.strip()
            ]
            for code, col in [
                (c, "primary_unit_external_id") for c in ([primary] if primary else [])
            ] + [(c, "secondary_unit_external_ids") for c in secondary]:
                u = units.get(code)
                if u is None:
                    run.error(i, "unit_not_found", f"Unknown unit {code!r}.", col, value=code)
                elif u.archived_at is not None:
                    run.error(i, "unit_archived", f"Unit {code!r} is archived.", col, value=code)
            if r.get("position") and not primary:
                run.error(
                    i,
                    "position_without_unit",
                    "position needs primary_unit_external_id.",
                    "position",
                )
            if secondary and not primary:  # docs/0084: the primary unit is never guessed
                run.error(
                    i,
                    "primary_required",
                    "secondary_unit_external_ids needs primary_unit_external_id.",
                    "primary_unit_external_id",
                )
            match_ext, match_email = by_ext.get(ext) if ext else None, by_email.get(email)
            if match_ext and match_email and match_ext.id != match_email.id:
                run.error(
                    i,
                    "identity_conflict",
                    f"external_id matches {match_ext.email}, but the email belongs to someone "
                    "else.",
                    email=match_ext.email,
                )
            elif (
                ext
                and match_ext is None
                and match_email is not None
                and match_email.external_id not in (None, ext)
            ):
                # Never silently re-key a person: identities would drift (docs/0084).
                run.error(
                    i,
                    "identity_conflict",
                    f"{email} already has external_id {match_email.external_id!r}, not {ext!r}.",
                    "external_id",
                    email=email,
                    current=match_email.external_id,
                    value=ext,
                )
            parsed.append(
                (
                    i,
                    {
                        "email": email,
                        "name": name,
                        "ext": ext,
                        "title": r.get("title"),
                        "primary": primary,
                        "secondary": secondary,
                        "position": r.get("position"),
                        "match": match_ext or match_email,
                    },
                )
            )
        if run.report.errors:
            return await self._finish(run, apply)

        now = datetime.now(UTC)
        positions = {
            (p.unit_id, p.title.lower()): p
            for p in await self.db.scalars(
                select(models.Position).where(models.Position.tenant_id == self._tenant)
            )
        }
        for _row_no, row in parsed:
            person: models.Person | None = row["match"]
            values = {"email": row["email"], "display_name": row["name"], "title": row["title"]}
            if row["ext"]:
                values["external_id"] = row["ext"]
            is_new = person is None
            if person is None:
                person = models.Person(
                    id=models.new_id(),
                    tenant_id=self._tenant,
                    source=models.RecordSource.IMPORT,
                    active=True,
                    created_at=now,
                    updated_at=now,
                    **({"external_id": None} | values),
                )
                self.db.add(person)
                changed = True
            else:
                changed = any(getattr(person, k) != v for k, v in values.items())
                for k, v in values.items():
                    setattr(person, k, v)
                if not person.active:
                    person.active = True
                    run.report.reactivated += 1
                    changed = True
            await self.db.flush()  # the person must exist before memberships reference it
            if row["primary"] or row["secondary"]:
                changed |= await self._replace_memberships(person, row, units, positions, run, now)
            if is_new:
                run.report.created += 1
            elif changed:
                person.updated_at = now
                run.report.updated += 1
            else:
                run.report.unchanged += 1
        return await self._finish(run, apply)

    async def _replace_memberships(
        self,
        person: models.Person,
        row: dict[str, Any],
        units: dict[str, models.OrgUnit],
        positions: dict[tuple[uuid.UUID, str], models.Position],
        run: ImportRun,
        now: datetime,
    ) -> bool:
        primary_unit = units[row["primary"]] if row["primary"] else None
        position_id = None
        if primary_unit is not None and row["position"]:
            key = (primary_unit.id, row["position"].lower())
            pos = positions.get(key)
            if pos is None:
                pos = models.Position(
                    id=models.new_id(),
                    tenant_id=self._tenant,
                    unit_id=primary_unit.id,
                    title=row["position"],
                    created_at=now,
                    updated_at=now,
                )
                self.db.add(pos)
                positions[key] = pos
                run.report.positions_created += 1
                await self.db.flush()
            position_id = pos.id
        wanted = {}
        if primary_unit is not None:
            wanted[primary_unit.id] = (True, position_id)
        for code in row["secondary"]:
            uid = units[code].id
            wanted.setdefault(uid, (False, None))
        current = {
            (m.unit_id, m.is_primary, m.position_id)
            for m in await self.db.scalars(
                select(models.UnitMembership).where(models.UnitMembership.person_id == person.id)
            )
        }
        target = {(uid, primary, pos) for uid, (primary, pos) in wanted.items()}
        if current == target:
            return False
        await self.db.execute(
            delete(models.UnitMembership).where(models.UnitMembership.person_id == person.id)
        )
        await self.db.flush()
        for uid, (primary, position) in wanted.items():
            self.db.add(
                models.UnitMembership(
                    person_id=person.id,
                    unit_id=uid,
                    tenant_id=self._tenant,
                    is_primary=primary,
                    position_id=position,
                    primary_override=primary,
                )
            )
        await self.db.flush()
        return True
