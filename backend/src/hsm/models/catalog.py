"""Zone types, furniture/device catalog and devices (docs/0020, 0021, 0022)."""

import enum
import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from hsm.models.base import (
    ArchivableMixin,
    Base,
    IdMixin,
    TenantMixin,
    TimestampMixin,
    str_enum,
)


class ZoneType(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "zone_type"
    __table_args__ = (UniqueConstraint("tenant_id", "name"),)

    name: Mapped[str] = mapped_column(String(100))
    is_enclosed: Mapped[bool] = mapped_column(Boolean, default=False)
    color: Mapped[str | None] = mapped_column(String(16))


class CatalogItem(IdMixin, TimestampMixin, ArchivableMixin, Base):
    """tenant_id NULL = built-in item shipped with HSM, seeded by migration (docs/0034 review E)."""

    __tablename__ = "catalog_item"
    __table_args__ = (UniqueConstraint("tenant_id", "key", postgresql_nulls_not_distinct=True),)

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tenant.id"), index=True)
    key: Mapped[str] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(200))


class CatalogShape(enum.StrEnum):
    BOX = "box"
    CYLINDER = "cylinder"
    L_SHAPE = "l_shape"
    MODEL = "model"


class CatalogItemRev(IdMixin, Base):
    """Immutable once used; dimension changes create a new rev_no (docs/0021)."""

    __tablename__ = "catalog_item_rev"
    __table_args__ = (
        UniqueConstraint("item_id", "rev_no"),
        CheckConstraint("width_mm > 0 AND depth_mm > 0 AND height_mm > 0", name="positive_dims"),
    )

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tenant.id"), index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("catalog_item.id"), index=True)
    rev_no: Mapped[int] = mapped_column(Integer)
    shape: Mapped[CatalogShape] = mapped_column(str_enum(CatalogShape, "catalog_shape"))
    width_mm: Mapped[int] = mapped_column(Integer)
    depth_mm: Mapped[int] = mapped_column(Integer)
    height_mm: Mapped[int] = mapped_column(Integer)
    color: Mapped[str | None] = mapped_column(String(16))
    model_key: Mapped[str | None] = mapped_column(String(200))
    is_seat: Mapped[bool] = mapped_column(Boolean, default=False)
    mountable: Mapped[bool] = mapped_column(Boolean, default=False)
    attaches_to_categories: Mapped[list[str]] = mapped_column(ARRAY(String(50)), default=list)
    footprint_blocks: Mapped[bool] = mapped_column(Boolean, default=True)


class Device(IdMixin, TenantMixin, TimestampMixin, Base):
    """Asset identity of a placed device, stable across floors (docs/0022, docs/0034 review B)."""

    __tablename__ = "device"
    __table_args__ = (UniqueConstraint("tenant_id", "asset_tag"),)

    asset_tag: Mapped[str | None] = mapped_column(String(100))
    serial_number: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    assigned_person_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("person.id"))
