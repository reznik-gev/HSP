"""Exclusive edit lock per floor (docs/0016).

One editor per floor at a time. Acquiring takes a free or expired lock, or extends your own
(heartbeat). The lock expires unless heartbeats arrive. Admins can force-release it. Acquire,
release and force-release are audited; heartbeats are not (docs/0033).
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

from pydantic import BaseModel
from sqlalchemy import and_, case, delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.audit import audit_event
from hsp.auth.principal import Principal
from hsp.models import AuditEvent, Floor, FloorEditLock
from hsp.problems import ProblemException


class LockStatus(BaseModel):
    floor_id: uuid.UUID
    locked: bool
    holder_subject: str | None = None
    holder_name: str | None = None
    acquired_at: datetime | None = None
    expires_at: datetime | None = None
    #: True when the caller holds the lock (their editor may save).
    is_mine: bool = False


@dataclass(frozen=True)
class Lock:
    floor_id: uuid.UUID
    holder_subject: str
    holder_name: str | None
    acquired_at: datetime
    expires_at: datetime


class LockRepository(Protocol):
    async def floor_state(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> str | None:
        """'active', 'archived', or None if the floor doesn't exist."""
        ...

    async def get(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> Lock | None: ...

    async def try_acquire(
        self,
        tenant_id: uuid.UUID,
        floor_id: uuid.UUID,
        *,
        subject: str,
        name: str | None,
        now: datetime,
        expires_at: datetime,
    ) -> Lock | None:
        """Atomically take the lock if it is free, expired or already the caller's.

        Returns the resulting lock, or None if someone else holds a valid lock. A caller who
        already holds it keeps its original `acquired_at` (a heartbeat only extends it).
        """
        ...

    async def delete(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> None: ...

    def record(self, event: AuditEvent) -> None: ...

    async def commit(self) -> None: ...


class SqlLockRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def floor_state(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> str | None:
        archived_at = await self._db.execute(
            select(Floor.archived_at).where(Floor.tenant_id == tenant_id, Floor.id == floor_id)
        )
        row = archived_at.first()
        if row is None:
            return None
        return "archived" if row[0] is not None else "active"

    async def get(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> Lock | None:
        row = await self._db.scalar(
            select(FloorEditLock).where(
                FloorEditLock.tenant_id == tenant_id, FloorEditLock.floor_id == floor_id
            )
        )
        return _to_lock(row) if row else None

    async def try_acquire(
        self,
        tenant_id: uuid.UUID,
        floor_id: uuid.UUID,
        *,
        subject: str,
        name: str | None,
        now: datetime,
        expires_at: datetime,
    ) -> Lock | None:
        values = insert(FloorEditLock).values(
            floor_id=floor_id,
            tenant_id=tenant_id,
            holder_subject=subject,
            holder_name=name,
            acquired_at=now,
            expires_at=expires_at,
        )
        new = values.excluded
        # One statement, so two editors racing for the same floor can't both win.
        upsert = values.on_conflict_do_update(
            index_elements=[FloorEditLock.floor_id],
            set_={
                "holder_subject": new.holder_subject,
                "holder_name": new.holder_name,
                "expires_at": new.expires_at,
                # Keep the original acquire time on a heartbeat; reset it on a takeover
                # (including the same person returning after their lock expired).
                "acquired_at": case(
                    (
                        and_(
                            FloorEditLock.holder_subject == new.holder_subject,
                            FloorEditLock.expires_at > now,
                        ),
                        FloorEditLock.acquired_at,
                    ),
                    else_=new.acquired_at,
                ),
            },
            where=(FloorEditLock.expires_at <= now) | (FloorEditLock.holder_subject == subject),
        ).returning(FloorEditLock)
        row = await self._db.scalar(upsert, execution_options={"populate_existing": True})
        return _to_lock(row) if row is not None else None

    async def delete(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> None:
        await self._db.execute(
            delete(FloorEditLock).where(
                FloorEditLock.tenant_id == tenant_id, FloorEditLock.floor_id == floor_id
            )
        )

    def record(self, event: AuditEvent) -> None:
        self._db.add(event)

    async def commit(self) -> None:
        await self._db.commit()


def _to_lock(row: FloorEditLock) -> Lock:
    return Lock(row.floor_id, row.holder_subject, row.holder_name, row.acquired_at, row.expires_at)


@dataclass
class LocksService:
    repo: LockRepository
    principal: Principal
    ttl: timedelta
    request_id: str | None = None

    def _status(self, floor_id: uuid.UUID, lock: Lock | None, now: datetime) -> LockStatus:
        if lock is None or lock.expires_at <= now:
            return LockStatus(floor_id=floor_id, locked=False)
        return LockStatus(
            floor_id=floor_id,
            locked=True,
            holder_subject=lock.holder_subject,
            holder_name=lock.holder_name,
            acquired_at=lock.acquired_at,
            expires_at=lock.expires_at,
            is_mine=lock.holder_subject == self.principal.subject,
        )

    async def _require_floor(self, floor_id: uuid.UUID, *, active: bool = False) -> None:
        state = await self.repo.floor_state(self.principal.tenant_id, floor_id)
        if state is None:
            raise ProblemException(
                404, "not-found", "Not found", f"Floor {floor_id} does not exist."
            )
        if active and state == "archived":
            raise ProblemException(
                409, "archived", "Archived", "Restore the floor before editing it (docs/0078)."
            )

    async def status(self, floor_id: uuid.UUID) -> LockStatus:
        await self._require_floor(floor_id)
        lock = await self.repo.get(self.principal.tenant_id, floor_id)
        return self._status(floor_id, lock, datetime.now(UTC))

    async def acquire(self, floor_id: uuid.UUID) -> LockStatus:
        """Take the lock, or extend it if you already hold it (heartbeat)."""
        await self._require_floor(floor_id, active=True)
        tenant, now = self.principal.tenant_id, datetime.now(UTC)
        before = await self.repo.get(tenant, floor_id)
        lock = await self.repo.try_acquire(
            tenant,
            floor_id,
            subject=self.principal.subject,
            name=self.principal.name,
            now=now,
            expires_at=now + self.ttl,
        )
        if lock is None:
            holder = await self.repo.get(tenant, floor_id)
            who = (holder.holder_name or holder.holder_subject) if holder else "someone else"
            since = f" since {holder.acquired_at:%H:%M} UTC" if holder else ""
            raise ProblemException(
                423, "floor-locked", "Floor is being edited", f"Being edited by {who}{since}."
            )
        was_mine = (
            before is not None
            and before.expires_at > now
            and before.holder_subject == self.principal.subject
        )
        if not was_mine:  # a new acquisition, not a heartbeat (heartbeats aren't audited)
            expired_holder = (
                before.holder_subject
                if before and before.holder_subject != self.principal.subject
                else None
            )
            self._audit(
                "floor.lock_acquired",
                floor_id,
                after={"expires_at": lock.expires_at, "took_over_expired_lock_of": expired_holder},
            )
        await self.repo.commit()
        return self._status(floor_id, lock, now)

    async def release(self, floor_id: uuid.UUID) -> None:
        """Give up your own lock. Idempotent; refuses to release someone else's."""
        await self._require_floor(floor_id)
        tenant, now = self.principal.tenant_id, datetime.now(UTC)
        lock = await self.repo.get(tenant, floor_id)
        if lock is None or lock.expires_at <= now:
            return
        if lock.holder_subject != self.principal.subject:
            raise ProblemException(
                409,
                "not-lock-holder",
                "Not your lock",
                "Only the editor can release it; admins can force-release (docs/0016).",
            )
        await self.repo.delete(tenant, floor_id)
        self._audit("floor.lock_released", floor_id)
        await self.repo.commit()

    async def force_release(self, floor_id: uuid.UUID) -> None:
        """Admin override: remove anyone's lock. The holder's draft is kept (docs/0016)."""
        await self._require_floor(floor_id)
        tenant, now = self.principal.tenant_id, datetime.now(UTC)
        lock = await self.repo.get(tenant, floor_id)
        if lock is None or lock.expires_at <= now:
            return
        await self.repo.delete(tenant, floor_id)
        self._audit(
            "floor.lock_force_released",
            floor_id,
            before={"holder_subject": lock.holder_subject, "holder_name": lock.holder_name},
        )
        await self.repo.commit()

    def _audit(
        self,
        action: str,
        floor_id: uuid.UUID,
        *,
        before: dict[str, object] | None = None,
        after: dict[str, object] | None = None,
    ) -> None:
        self.repo.record(
            audit_event(
                self.principal,
                action=action,
                entity_type="floor",
                entity_id=floor_id,
                before=before,
                after=after,
                request_id=self.request_id,
            )
        )
