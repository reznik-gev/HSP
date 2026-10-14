"""CSV/Excel import of seat assignments (docs/0085), e.g. the first seating of a new office.

Columns: `seat_label`*, `building_code`, and exactly one of `holder_email` or
`holder_unit_external_id`; optional `note`. The building code is needed only when the label is
used in more than one building. Seats not in the file are left alone. Assigning a taken seat
reassigns it (docs/0086). Dry run first, all or nothing (hsp/imports.py).
"""

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.auth.principal import Principal
from hsp.imports import ImportReport, ImportRun, check_columns, finish_import
from hsp.seats.assignments import PublishedSeat, SeatAssignmentService
from hsp.seats.published import published_seats

COLUMNS = {"seat_label", "building_code", "holder_email", "holder_unit_external_id", "note"}


@dataclass
class _Seat:
    seat: PublishedSeat
    building_code: str


@dataclass
class _Row:
    row: int
    seat: PublishedSeat
    person_id: uuid.UUID | None
    unit_id: uuid.UUID | None
    note: str | None


@dataclass
class SeatImportService:
    db: AsyncSession
    principal: Principal
    request_id: str | None = None

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    async def import_assignments(
        self, rows: list[dict[str, str | None]], apply: bool
    ) -> ImportReport:
        run = ImportRun(ImportReport(kind="seat_assignments", applied=False, rows=len(rows)))
        if check_columns(rows, COLUMNS, {"seat_label"}, run):
            wanted = await self._resolve(rows, run)
            if not run.report.errors:
                await self._apply(wanted, run)
        return await finish_import(self.db, self.principal, self.request_id, run, apply)

    async def _resolve(self, rows: list[dict[str, str | None]], run: ImportRun) -> list[_Row]:
        seats = await self._seats_by_label()
        people = {
            p.email.lower(): p
            for p in await self.db.scalars(
                select(models.Person).where(models.Person.tenant_id == self._tenant)
            )
        }
        units = {
            u.external_id: u
            for u in await self.db.scalars(
                select(models.OrgUnit).where(models.OrgUnit.tenant_id == self._tenant)
            )
            if u.external_id
        }
        out: list[_Row] = []
        seen: dict[uuid.UUID, int] = {}
        for i, r in enumerate(rows, start=2):
            seat = self._find_seat(i, r, seats, run)
            holder = self._find_holder(i, r, people, units, run)
            if seat is None or holder is None:
                continue
            if seat.id in seen:
                run.error(
                    i,
                    "duplicate_row",
                    f"Seat {seat.label} appears twice (also row {seen[seat.id]}).",
                    "seat_label",
                    value=seat.label,
                    other_row=seen[seat.id],
                )
                continue
            seen[seat.id] = i
            out.append(_Row(i, seat, holder[0], holder[1], r.get("note")))
        return out

    async def _seats_by_label(self) -> dict[str, list[_Seat]]:
        r, f, b = models.ObjectRev, models.Floor, models.Building
        query = select(r.element_id, r.label, f.id, r.allocation_mode, b.code).select_from(r)
        found: dict[str, list[_Seat]] = {}
        for seat_id, label, floor_id, mode, code in await self.db.execute(
            published_seats(query, self._tenant).where(r.label.is_not(None))
        ):
            seat = PublishedSeat(seat_id, label, floor_id, mode)
            found.setdefault(label.lower(), []).append(_Seat(seat, code))
        return found

    def _find_seat(
        self, i: int, r: dict[str, Any], seats: dict[str, list[_Seat]], run: ImportRun
    ) -> PublishedSeat | None:
        label, code = r.get("seat_label"), r.get("building_code")
        if not label:
            run.error(i, "required", "seat_label is required.", "seat_label")
            return None
        matches = [s for s in seats.get(label.lower(), []) if not code or s.building_code == code]
        if not matches:
            where = f" in building {code}" if code else ""
            run.error(
                i,
                "seat_not_found",
                f"No published seat {label}{where}.",
                "seat_label",
                value=label,
                **({"building": code} if code else {}),
            )
            return None
        if len(matches) > 1:
            codes = ", ".join(sorted(s.building_code for s in matches))
            run.error(
                i,
                "seat_ambiguous",
                f"Seat {label} exists in several buildings ({codes}); add building_code.",
                "building_code",
                value=label,
                buildings=codes,
            )
            return None
        seat = matches[0].seat
        if seat.mode != models.AllocationMode.ASSIGNED:
            run.error(
                i,
                "seat_not_assignable",
                f"Seat {label} is {seat.mode}; only 'assigned' seats can be assigned.",
                "seat_label",
                value=label,
                mode=seat.mode,
            )
            return None
        return seat

    def _find_holder(
        self,
        i: int,
        r: dict[str, Any],
        people: dict[str, models.Person],
        units: dict[str, models.OrgUnit],
        run: ImportRun,
    ) -> tuple[uuid.UUID | None, uuid.UUID | None] | None:
        email, unit_ext = r.get("holder_email"), r.get("holder_unit_external_id")
        if bool(email) == bool(unit_ext):
            run.error(
                i,
                "holder_required",
                "Give exactly one of holder_email or holder_unit_external_id.",
                "holder_email",
            )
            return None
        if email:
            person = people.get(email.lower())
            if person is None:
                run.error(i, "holder_not_found", f"No person {email}.", "holder_email", value=email)
                return None
            if not person.active:
                run.error(
                    i,
                    "holder_inactive",
                    f"{person.display_name} is inactive.",
                    "holder_email",
                    name=person.display_name,
                )
                return None
            return person.id, None
        unit = units.get(unit_ext or "")
        column = "holder_unit_external_id"
        if unit is None:
            message = f"No unit with external id {unit_ext}."
            run.error(i, "holder_not_found", message, column, value=unit_ext)
            return None
        if unit.archived_at is not None:
            run.error(i, "holder_inactive", f"{unit.name} is archived.", column, name=unit.name)
            return None
        return None, unit.id

    async def _apply(self, wanted: list[_Row], run: ImportRun) -> None:
        seats = SeatAssignmentService(self.db, self.principal, self.request_id)
        for row in wanted:
            before = await seats.get(row.seat.id)
            held = before.assignment
            if held and (held.holder_person_id, held.holder_unit_id, held.note) == (
                row.person_id,
                row.unit_id,
                row.note,
            ):
                run.report.unchanged += 1
                continue
            await seats.place(row.seat, row.person_id, row.unit_id, row.note)
            if held is None:
                run.report.created += 1
            else:
                run.report.updated += 1  # reassigned, or the same holder with a new note
