"""Batch seat changes: assign, unassign and swap in one all-or-nothing request (docs/0085).

Steps run in order, each seeing the effect of the ones before (a team move is "unassign A,
assign A to X"). Every step is checked; if any fails, nothing is written and every failing step
is reported with its index. Assigning a taken seat reassigns it (docs/0086).
"""

import uuid
from dataclasses import dataclass
from typing import Annotated, Literal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.auth.principal import Principal
from hsp.problems import ProblemError, ProblemException
from hsp.release import FreedSeat
from hsp.seats.assignments import AssignmentIn, SeatAssignmentOut, SeatAssignmentService


class AssignStep(AssignmentIn):
    op: Literal["assign"]
    seat_id: uuid.UUID


class UnassignStep(BaseModel):
    op: Literal["unassign"]
    seat_id: uuid.UUID


class SwapStep(BaseModel):
    op: Literal["swap"]
    seat_id: uuid.UUID
    other_seat_id: uuid.UUID = Field(description="The two seats exchange holders")


BatchStep = Annotated[AssignStep | UnassignStep | SwapStep, Field(discriminator="op")]


class BatchIn(BaseModel):
    steps: list[BatchStep] = Field(min_length=1, max_length=1000)


class BatchResult(BaseModel):
    seats: list[SeatAssignmentOut] = Field(
        description="Final state of every seat the batch touched"
    )
    released: list[FreedSeat] = Field(
        description="Holders who held a touched seat before the batch and no longer do"
    )


@dataclass(frozen=True)
class Held:
    person_id: uuid.UUID | None
    unit_id: uuid.UUID | None
    note: str | None

    @property
    def key(self) -> tuple[uuid.UUID | None, uuid.UUID | None]:
        return (self.person_id, self.unit_id)


@dataclass
class SeatBatchService:
    db: AsyncSession
    principal: Principal
    request_id: str | None = None

    async def apply(self, body: BatchIn) -> BatchResult:
        seats = SeatAssignmentService(self.db, self.principal, self.request_id)
        touched = [s for step in body.steps for s in _seat_ids(step)]
        before = await self._holders(list(dict.fromkeys(touched)))
        errors: list[ProblemError] = []
        for i, step in enumerate(body.steps):
            try:
                async with self.db.begin_nested():  # a failed step leaves no trace
                    await self._step(seats, step)
            except ProblemException as exc:
                errors.append(_step_error(i, step, exc))
        if errors:
            await self.db.rollback()
            raise ProblemException(
                422,
                "batch-invalid",
                "Batch can't be applied",
                f"{len(errors)} step(s) failed; nothing was changed.",
                errors=errors,
            )
        after = await self._holders(list(before))
        released = []
        for seat_id, held in before.items():
            now = after[seat_id]
            if held is not None and (now is None or now.key != held.key):
                released.append(
                    FreedSeat(
                        seat_id=seat_id,
                        holder_person_id=held.person_id,
                        holder_unit_id=held.unit_id,
                    )
                )
        result = BatchResult(seats=[await seats.get(s) for s in before], released=released)
        await self.db.commit()
        return result

    async def _step(
        self, seats: SeatAssignmentService, step: AssignStep | UnassignStep | SwapStep
    ) -> None:
        if isinstance(step, AssignStep):
            seat = await seats.assignable_seat(step.seat_id)
            await seats.check_holder(step)
            await seats.place(seat, step.person_id, step.unit_id, step.note)
        elif isinstance(step, UnassignStep):
            await seats.release(step.seat_id, reason="Unassigned in a batch")
        else:
            first = await seats.assignable_seat(step.seat_id)
            second = await seats.assignable_seat(step.other_seat_id)
            holders = await self._holders([first.id, second.id])
            a, b = holders[first.id], holders[second.id]
            for seat in (first, second):
                await seats.release(seat.id, reason="Swapped in a batch")
            if b is not None:
                await seats.place(first, b.person_id, b.unit_id, b.note)
            if a is not None:
                await seats.place(second, a.person_id, a.unit_id, a.note)

    async def _holders(self, seat_ids: list[uuid.UUID]) -> dict[uuid.UUID, Held | None]:
        """Snapshots of the seats' current holders."""
        rows = {
            a.seat_element_id: a
            for a in await self.db.scalars(
                select(models.SeatAssignment).where(
                    models.SeatAssignment.tenant_id == self.principal.tenant_id,
                    models.SeatAssignment.seat_element_id.in_(seat_ids),
                )
            )
        }
        return {
            seat_id: Held(a.holder_person_id, a.holder_unit_id, a.note)
            if (a := rows.get(seat_id))
            else None
            for seat_id in seat_ids
        }


def _seat_ids(step: AssignStep | UnassignStep | SwapStep) -> list[uuid.UUID]:
    return [step.seat_id, step.other_seat_id] if isinstance(step, SwapStep) else [step.seat_id]


def _step_error(
    index: int, step: AssignStep | UnassignStep | SwapStep, exc: ProblemException
) -> ProblemError:
    inner = exc.errors[0] if exc.errors else None
    return ProblemError(
        code=inner.code if inner else exc.slug.replace("-", "_"),
        message=(inner.message if inner else exc.detail) or exc.title,
        op_index=index,
        element_id=str(step.seat_id),
    )
