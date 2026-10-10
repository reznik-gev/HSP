"""Tenancy, locations, floor versions and edit locks (docs/0003, 0015, 0016, 0020, 0028)."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from hsp.models.base import (
    ArchivableMixin,
    Base,
    IdMixin,
    TenantMixin,
    TimestampMixin,
    str_enum,
)


class Tenant(IdMixin, TimestampMixin, Base):
    __tablename__ = "tenant"

    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(64), unique=True)


class Site(IdMixin, TenantMixin, TimestampMixin, ArchivableMixin, Base):
    __tablename__ = "site"

    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(Text)
    time_zone: Mapped[str] = mapped_column(String(64))


class Building(IdMixin, TenantMixin, TimestampMixin, ArchivableMixin, Base):
    __tablename__ = "building"
    __table_args__ = (UniqueConstraint("site_id", "code"),)

    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("site.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(32))


class Floor(IdMixin, TenantMixin, TimestampMixin, ArchivableMixin, Base):
    __tablename__ = "floor"
    __table_args__ = (UniqueConstraint("building_id", "level_index"),)

    building_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("building.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    level_index: Mapped[int] = mapped_column(Integer)
    elevation_mm: Mapped[int] = mapped_column(Integer, default=0)
    default_wall_height_mm: Mapped[int] = mapped_column(Integer, default=2800)
    origin_x_mm: Mapped[int] = mapped_column(Integer, default=0)
    origin_y_mm: Mapped[int] = mapped_column(Integer, default=0)
    published_version: Mapped[int | None] = mapped_column(Integer)


class FloorVersionState(enum.StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    SUPERSEDED = "superseded"
    DISCARDED = "discarded"


class FloorVersion(IdMixin, TenantMixin, Base):
    __tablename__ = "floor_version"
    __table_args__ = (
        UniqueConstraint("floor_id", "version_no"),
        # At most one draft per floor (docs/0015).
        Index(
            "uq_floor_version_one_draft",
            "floor_id",
            unique=True,
            postgresql_where=text("state = 'draft'"),
        ),
    )

    floor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("floor.id"), index=True)
    version_no: Mapped[int] = mapped_column(Integer)
    state: Mapped[FloorVersionState] = mapped_column(
        str_enum(FloorVersionState, "floor_version_state")
    )
    # Draft revision counter, incremented per accepted changeset (docs/0036).
    revision: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    published_by: Mapped[str | None] = mapped_column(String(255))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(Text)


class FloorEditLock(TenantMixin, Base):
    """Exclusive edit lock per floor (docs/0016). An expired row counts as free."""

    __tablename__ = "floor_edit_lock"

    floor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("floor.id"), primary_key=True)
    holder_subject: Mapped[str] = mapped_column(String(255))
    # Display name at acquire time, so others see "Being edited by <name>" (docs/0016).
    holder_name: Mapped[str | None] = mapped_column(String(200))
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
