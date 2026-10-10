"""Floor-plan payload (docs/0036): integer millimetres, decidegrees, compact coordinate arrays.

Element `id`s are the stable element ids that survive across versions (docs/0028).
"""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Point2 = tuple[int, int]
Point3 = tuple[int, int, int]


class Wall(BaseModel):
    id: uuid.UUID
    a: Point2
    b: Point2
    thickness_mm: int
    height_mm: int


class Opening(BaseModel):
    id: uuid.UUID
    wall_id: uuid.UUID
    type: Literal["door", "window"]
    offset_mm: int
    width_mm: int
    height_mm: int
    sill_mm: int
    swing: Literal["left_in", "left_out", "right_in", "right_out", "sliding", "none"]


class Column(BaseModel):
    id: uuid.UUID
    footprint: list[Point2]
    height_mm: int


class Zone(BaseModel):
    id: uuid.UUID
    name: str
    zone_type_id: uuid.UUID
    parent_zone_id: uuid.UUID | None
    boundary: list[Point2] = Field(description="Polygon vertices, not repeating the first point")


class PlacedObject(BaseModel):
    id: uuid.UUID
    catalog_item_rev_id: uuid.UUID
    position: Point3
    rotation_ddeg: int
    label: str | None
    attached_to: uuid.UUID | None
    device_id: uuid.UUID | None
    allocation_mode: Literal["assigned", "bookable", "unavailable"] | None


class CatalogItem(BaseModel):
    """A catalog item revision used by the plan, embedded so the editor needs no extra calls."""

    id: uuid.UUID = Field(description="catalog_item_rev id (what objects reference)")
    item_id: uuid.UUID
    key: str
    category: str
    name: str
    shape: Literal["box", "cylinder", "l_shape", "model"]
    width_mm: int
    depth_mm: int
    height_mm: int
    color: str | None
    is_seat: bool
    mountable: bool
    attaches_to_categories: list[str]
    footprint_blocks: bool


class PlanContent(BaseModel):
    walls: list[Wall] = []
    openings: list[Opening] = []
    columns: list[Column] = []
    zones: list[Zone] = []
    objects: list[PlacedObject] = []
    catalog: dict[str, CatalogItem] = {}


VersionState = Literal["draft", "published", "superseded", "discarded"]


class FloorVersion(BaseModel):
    version: int
    state: VersionState
    revision: int = Field(description="Draft revision counter, bumped per changeset (docs/0036)")
    created_by: str
    created_at: datetime
    published_by: str | None
    published_at: datetime | None
    note: str | None


class Plan(PlanContent):
    floor_id: uuid.UUID
    version: int
    state: VersionState
    revision: int


ElementKind = Literal["walls", "openings", "columns", "zones", "objects"]
KINDS: tuple[ElementKind, ...] = ("walls", "openings", "columns", "zones", "objects")


class ElementChange(BaseModel):
    id: uuid.UUID
    before: dict[str, Any] = Field(description="Only the fields that differ, as in version a")
    after: dict[str, Any] = Field(description="The same fields, as in version b")


class KindDiff(BaseModel):
    added: list[dict[str, Any]] = Field(default=[], description="Full elements present only in b")
    removed: list[dict[str, Any]] = Field(default=[], description="Full elements present only in a")
    changed: list[ElementChange] = []


class PlanDiff(BaseModel):
    floor_id: uuid.UUID
    from_version: int
    to_version: int
    walls: KindDiff = KindDiff()
    openings: KindDiff = KindDiff()
    columns: KindDiff = KindDiff()
    zones: KindDiff = KindDiff()
    objects: KindDiff = KindDiff()
