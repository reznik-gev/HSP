"""CSV/Excel import of org units and people (docs/0027, docs/0084).

Dry run by default: the import runs exactly as it would for real inside the transaction, then
rolls back, so the preview reports everything a real run would (including database errors).
With apply=True it commits. All or nothing: any row error means nothing is written.
"""

import csv
import io
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from email_validator import EmailNotValidError, validate_email
from openpyxl import load_workbook
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.audit import audit_event
from hsp.auth.principal import Principal
from hsp.problems import ProblemException

MAX_ROWS = 50_000
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


class RowError(BaseModel):
    row: int  # 1-based spreadsheet row; the header is row 1
    column: str | None = None
    code: str
    message: str


class ImportReport(BaseModel):
    kind: str
    applied: bool
    rows: int
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    reactivated: int = 0
    positions_created: int = 0
    errors: list[RowError] = []
    warnings: list[str] = []


def read_table(filename: str, data: bytes) -> list[dict[str, str | None]]:
    """Rows as dicts keyed by lowercase header. CSV (UTF-8, BOM ok) or XLSX (first sheet)."""
    name = filename.lower()
    if name.endswith(".xlsx"):
        sheet = load_workbook(io.BytesIO(data), read_only=True, data_only=True).worksheets[0]
        raw = [
            [("" if c is None else str(c)) for c in r] for r in sheet.iter_rows(values_only=True)
        ]
    elif name.endswith(".csv"):
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise ProblemException(
                422, "import-unreadable", "Unreadable file", "CSV files must be UTF-8."
            ) from None
        raw = list(csv.reader(io.StringIO(text)))
    else:
        raise ProblemException(
            415, "import-format", "Unsupported file", "Upload a .csv or .xlsx file."
        )
    if not raw:
        return []
    header = [h.strip().lower() for h in raw[0]]
    rows = []
    for values in raw[1:]:
        if not any(v.strip() for v in values):
            continue  # skip blank lines
        rows.append({h: (v.strip() or None) for h, v in zip(header, values, strict=False) if h})
    if len(rows) > MAX_ROWS:
        raise ProblemException(
            413, "import-too-large", "Too many rows", f"At most {MAX_ROWS} rows per import."
        )
    return rows


@dataclass
class _Run:
    report: ImportReport
    row_of: dict[str, int] = field(default_factory=dict)

    def error(self, row: int, code: str, message: str, column: str | None = None) -> None:
        self.report.errors.append(RowError(row=row, column=column, code=code, message=message))


def _columns_warning(
    rows: list[dict[str, Any]], known: set[str], required: set[str], run: _Run
) -> bool:
    present = set(rows[0]) if rows else set()
    missing = required - present
    if rows and missing:
        run.error(1, "missing_column", f"Missing required column(s): {', '.join(sorted(missing))}.")
        return False
    unknown = present - known
    if unknown:
        run.report.warnings.append(f"Ignored unknown column(s): {', '.join(sorted(unknown))}.")
    return True


@dataclass
class ImportService:
    db: AsyncSession
    principal: Principal
    request_id: str | None = None

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    async def _finish(self, run: _Run, apply: bool) -> ImportReport:
        if run.report.errors or not apply:
            await self.db.rollback()
            run.report.applied = False
            return run.report
        counts = run.report.model_dump(
            include={"rows", "created", "updated", "unchanged", "reactivated", "positions_created"}
        )
        self.db.add(
            audit_event(
                self.principal,
                action=f"import.{run.report.kind}",
                entity_type="import",
                entity_id=models.new_id(),
                after=counts,
                request_id=self.request_id,
            )
        )
        await self.db.commit()
        run.report.applied = True
        return run.report

    # Units -----------------------------------------------------------------------------------

    async def import_units(self, rows: list[dict[str, str | None]], apply: bool) -> ImportReport:
        run = _Run(ImportReport(kind="units", applied=False, rows=len(rows)))
        if not _columns_warning(rows, UNIT_COLUMNS, {"external_id", "name"}, run):
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
                )
            if ext in existing and existing[ext].archived_at is not None:
                run.error(
                    run.row_of[ext],
                    "unit_archived",
                    f"Unit {ext!r} is archived; restore it first.",
                    "external_id",
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
        run = _Run(ImportReport(kind="people", applied=False, rows=len(rows)))
        if not _columns_warning(rows, PEOPLE_COLUMNS, {"email", "display_name"}, run):
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
                run.error(i, "invalid_email", str(exc), "email")
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
                    run.error(i, "unit_not_found", f"Unknown unit {code!r}.", col)
                elif u.archived_at is not None:
                    run.error(i, "unit_archived", f"Unit {code!r} is archived.", col)
            if r.get("position") and not primary:
                run.error(
                    i,
                    "position_without_unit",
                    "position needs primary_unit_external_id.",
                    "position",
                )
            match_ext, match_email = by_ext.get(ext) if ext else None, by_email.get(email)
            if match_ext and match_email and match_ext.id != match_email.id:
                run.error(
                    i,
                    "identity_conflict",
                    f"external_id matches {match_ext.email}, but the email belongs to someone "
                    "else.",
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
        run: _Run,
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
