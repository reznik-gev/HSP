"""Seat assignments, audit log, sessions and user preferences (docs/0031, 0033, 0038, 0046)."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from hsp.models.base import Base, IdMixin, TenantMixin, TimestampMixin


class SeatAssignment(IdMixin, TenantMixin, Base):
    """At most one current holder per seat; history lives in audit_event (docs/0031)."""

    __tablename__ = "seat_assignment"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(holder_person_id, holder_unit_id) = 1", name="exactly_one_holder"
        ),
    )

    seat_element_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("floor_element.id"), unique=True)
    holder_person_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("person.id"), index=True)
    holder_unit_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("org_unit.id"), index=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    assigned_by: Mapped[str] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(Text)


class AuditEvent(IdMixin, TenantMixin, Base):
    """Append-only; the app DB role has no UPDATE/DELETE grant (docs/0033)."""

    __tablename__ = "audit_event"
    __table_args__ = (
        Index(
            "ix_audit_event_entity",
            "tenant_id",
            "entity_type",
            "entity_id",
            "occurred_at",
        ),
    )

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    actor_subject: Mapped[str] = mapped_column(String(255))
    # Plain UUID, deliberately not a foreign key: audit rows outlive what they reference.
    actor_person_id: Mapped[uuid.UUID | None]
    action: Mapped[str] = mapped_column(String(100))
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[uuid.UUID]
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    request_id: Mapped[str | None] = mapped_column(String(64))
    reason: Mapped[str | None] = mapped_column(Text)


class UserSession(IdMixin, TenantMixin, Base):
    """Server-side BFF session (docs/0038). The cookie carries an opaque token; only its hash
    is stored here.

    TODO: encrypt token columns at rest before the first production release.
    """

    __tablename__ = "user_session"

    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    subject: Mapped[str] = mapped_column(String(255), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    access_token: Mapped[str] = mapped_column(Text)
    refresh_token: Mapped[str | None] = mapped_column(Text)
    id_token: Mapped[str | None] = mapped_column(Text)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class UserProfile(TenantMixin, TimestampMixin, Base):
    """Per-user preferences such as display unit and grid size (docs/0046, docs/0047)."""

    __tablename__ = "user_profile"

    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    preferences: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
