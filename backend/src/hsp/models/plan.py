"""Floor elements and their version-range revisions (docs/0028, 0029, 0032).

A revision is visible in version v iff from_version <= v AND (to_version IS NULL OR v < to_version).
All lengths are integer millimetres; geometry is PostGIS SRID 0 in local floor coordinates.
Geometry columns leave srid unset: PostGIS stores that as SRID 0 ("unspecified"), which is what
we want, and it keeps Alembic autogenerate free of false type diffs.
"""

import enum
import uuid

from geoalchemy2 import Geometry
from sqlalchemy import CheckConstraint, ForeignKey, Integer, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import Mapped, declared_attr, mapped_column
from sqlalchemy.sql import literal_column

from hsp.models.base import Base, IdMixin, TenantMixin, str_enum


# Whole-millimetre grid checks (docs/0029).
def _on_grid(col: str) -> str:
    return f"ST_OrderingEquals({col}, ST_SnapToGrid({col}, 1))"


def _point_on_grid(col: str) -> str:
    return " AND ".join(f"{fn}({col}) = round({fn}({col}))" for fn in ("ST_X", "ST_Y", "ST_Z"))


class ElementKind(enum.StrEnum):
    WALL = "wall"
    OPENING = "opening"
    COLUMN = "column"
    ZONE = "zone"
    OBJECT = "object"


class FloorElement(IdMixin, TenantMixin, Base):
    """Stable identity of an element across floor versions."""

    __tablename__ = "floor_element"

    floor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("floor.id"), index=True)
    kind: Mapped[ElementKind] = mapped_column(str_enum(ElementKind, "element_kind"))


class RevisionMixin(IdMixin, TenantMixin):
    """Shared columns and constraints of every *_rev table."""

    element_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("floor_element.id"), index=True)
    from_version: Mapped[int] = mapped_column(Integer)
    to_version: Mapped[int | None] = mapped_column(Integer)

    @declared_attr.directive
    @classmethod
    def __table_args__(cls) -> tuple[object, ...]:
        return (
            CheckConstraint(
                "to_version IS NULL OR to_version > from_version", name="version_range"
            ),
            # Never two revisions of one element valid in the same version.
            ExcludeConstraint(
                (literal_column("element_id"), "="),
                (
                    func.int4range(literal_column("from_version"), literal_column("to_version")),
                    "&&",
                ),
                name=f"ex_{cls.__tablename__}_version_overlap",  # type: ignore[attr-defined]
                using="gist",
            ),
            *cls._extra_table_args(),
        )

    @classmethod
    def _extra_table_args(cls) -> tuple[object, ...]:
        return ()


class WallRev(RevisionMixin, Base):
    __tablename__ = "wall_rev"

    centerline: Mapped[object] = mapped_column(Geometry("LINESTRING"))
    thickness_mm: Mapped[int] = mapped_column(Integer)
    height_mm: Mapped[int] = mapped_column(Integer)

    @classmethod
    def _extra_table_args(cls) -> tuple[object, ...]:
        return (
            CheckConstraint(_on_grid("centerline"), name="centerline_on_grid"),
            CheckConstraint("ST_NPoints(centerline) = 2", name="centerline_two_points"),
            CheckConstraint("thickness_mm > 0 AND height_mm > 0", name="positive_dims"),
        )


class OpeningType(enum.StrEnum):
    DOOR = "door"
    WINDOW = "window"


class DoorSwing(enum.StrEnum):
    LEFT_IN = "left_in"
    LEFT_OUT = "left_out"
    RIGHT_IN = "right_in"
    RIGHT_OUT = "right_out"
    SLIDING = "sliding"
    NONE = "none"


class OpeningRev(RevisionMixin, Base):
    __tablename__ = "opening_rev"

    wall_element_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("floor_element.id"), index=True)
    opening_type: Mapped[OpeningType] = mapped_column(str_enum(OpeningType, "opening_type"))
    offset_mm: Mapped[int] = mapped_column(Integer)
    width_mm: Mapped[int] = mapped_column(Integer)
    height_mm: Mapped[int] = mapped_column(Integer)
    sill_mm: Mapped[int] = mapped_column(Integer, default=0)
    swing: Mapped[DoorSwing] = mapped_column(str_enum(DoorSwing, "door_swing"))

    @classmethod
    def _extra_table_args(cls) -> tuple[object, ...]:
        return (
            CheckConstraint(
                "offset_mm >= 0 AND width_mm > 0 AND height_mm > 0 AND sill_mm >= 0",
                name="valid_dims",
            ),
        )


class ColumnRev(RevisionMixin, Base):
    __tablename__ = "column_rev"

    footprint: Mapped[object] = mapped_column(Geometry("POLYGON"))
    height_mm: Mapped[int] = mapped_column(Integer)

    @classmethod
    def _extra_table_args(cls) -> tuple[object, ...]:
        return (
            CheckConstraint(_on_grid("footprint"), name="footprint_on_grid"),
            CheckConstraint("height_mm > 0", name="positive_height"),
        )


class ZoneRev(RevisionMixin, Base):
    __tablename__ = "zone_rev"

    name: Mapped[str] = mapped_column(String(200))
    zone_type_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("zone_type.id"))
    parent_zone_element_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("floor_element.id"))
    boundary: Mapped[object] = mapped_column(Geometry("POLYGON"))

    @classmethod
    def _extra_table_args(cls) -> tuple[object, ...]:
        return (
            CheckConstraint(_on_grid("boundary"), name="boundary_on_grid"),
            CheckConstraint("ST_NumInteriorRings(boundary) = 0", name="boundary_no_holes"),
        )


class AllocationMode(enum.StrEnum):
    ASSIGNED = "assigned"
    BOOKABLE = "bookable"
    UNAVAILABLE = "unavailable"


class ObjectRev(RevisionMixin, Base):
    __tablename__ = "object_rev"

    catalog_item_rev_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("catalog_item_rev.id"))
    position: Mapped[object] = mapped_column(Geometry("POINTZ", dimension=3))
    rotation_ddeg: Mapped[int] = mapped_column(SmallInteger, default=0)
    label: Mapped[str | None] = mapped_column(String(64))
    attached_to_element_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("floor_element.id"))
    device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("device.id"), index=True)
    # Required iff the catalog item is a seat; versioned with the layout (docs/0034 review C).
    allocation_mode: Mapped[AllocationMode | None] = mapped_column(
        str_enum(AllocationMode, "allocation_mode")
    )

    @classmethod
    def _extra_table_args(cls) -> tuple[object, ...]:
        return (
            CheckConstraint(_point_on_grid("position"), name="position_on_grid"),
            CheckConstraint("rotation_ddeg >= 0 AND rotation_ddeg < 3600", name="rotation_range"),
        )
