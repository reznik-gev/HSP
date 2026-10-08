"""People and organization (docs/0006, 0019, 0023, 0024, 0027)."""

import enum
import uuid

from sqlalchemy import Boolean, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from hsp.models.base import (
    ArchivableMixin,
    Base,
    IdMixin,
    TenantMixin,
    TimestampMixin,
    str_enum,
)


class RecordSource(enum.StrEnum):
    MANUAL = "manual"
    IMPORT = "import"
    AD = "ad"


class OrgUnit(IdMixin, TenantMixin, TimestampMixin, ArchivableMixin, Base):
    __tablename__ = "org_unit"
    __table_args__ = (
        UniqueConstraint("tenant_id", "external_id"),
        # Single root unit per tenant.
        Index(
            "uq_org_unit_single_root",
            "tenant_id",
            unique=True,
            postgresql_where=text("parent_id IS NULL"),
        ),
    )

    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("org_unit.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    level_label: Mapped[str | None] = mapped_column(String(100))
    color: Mapped[str | None] = mapped_column(String(16))
    external_id: Mapped[str | None] = mapped_column(String(255))
    source: Mapped[RecordSource] = mapped_column(str_enum(RecordSource, "org_unit_source"))


class Position(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "position"

    unit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("org_unit.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))


class Person(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "person"
    __table_args__ = (
        UniqueConstraint("tenant_id", "external_id"),
        UniqueConstraint("tenant_id", "email"),
        UniqueConstraint("tenant_id", "idp_subject"),
    )

    display_name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320))
    title: Mapped[str | None] = mapped_column(String(200))
    external_id: Mapped[str | None] = mapped_column(String(255))
    # Keycloak `sub`, linked on first login (docs/0027).
    idp_subject: Mapped[str | None] = mapped_column(String(255))
    source: Mapped[RecordSource] = mapped_column(str_enum(RecordSource, "person_source"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class UnitMembership(TenantMixin, Base):
    __tablename__ = "unit_membership"
    __table_args__ = (
        # At most one primary unit per person (docs/0006, docs/0023).
        Index(
            "uq_unit_membership_one_primary",
            "person_id",
            unique=True,
            postgresql_where=text("is_primary"),
        ),
    )

    person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("person.id"), primary_key=True)
    unit_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("org_unit.id"), primary_key=True, index=True
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    position_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("position.id"))
    primary_override: Mapped[bool] = mapped_column(Boolean, default=False)


class UnitManager(TenantMixin, Base):
    """Created now, unused until delegated ownership ships (docs/0024, docs/0025)."""

    __tablename__ = "unit_manager"

    unit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("org_unit.id"), primary_key=True)
    person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("person.id"), primary_key=True)
