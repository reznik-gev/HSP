"""ORM models implementing the v1 data model (docs/0034).

Importing this package registers every table on ``Base.metadata`` (used by Alembic).
"""

from hsp.models.activity import AuditEvent, SeatAssignment, UserProfile, UserSession
from hsp.models.base import Base, new_id
from hsp.models.catalog import CatalogItem, CatalogItemRev, CatalogShape, Device, ZoneType
from hsp.models.locations import (
    Building,
    Floor,
    FloorEditLock,
    FloorVersion,
    FloorVersionState,
    Site,
    Tenant,
)
from hsp.models.org import OrgUnit, Person, Position, RecordSource, UnitManager, UnitMembership
from hsp.models.plan import (
    AllocationMode,
    ColumnRev,
    DoorSwing,
    ElementKind,
    FloorElement,
    ObjectRev,
    OpeningRev,
    OpeningType,
    WallRev,
    ZoneRev,
)

__all__ = [
    "AllocationMode",
    "AuditEvent",
    "Base",
    "Building",
    "CatalogItem",
    "CatalogItemRev",
    "CatalogShape",
    "ColumnRev",
    "Device",
    "DoorSwing",
    "ElementKind",
    "Floor",
    "FloorEditLock",
    "FloorElement",
    "FloorVersion",
    "FloorVersionState",
    "ObjectRev",
    "OpeningRev",
    "OpeningType",
    "OrgUnit",
    "Person",
    "Position",
    "RecordSource",
    "SeatAssignment",
    "Site",
    "Tenant",
    "UnitManager",
    "UnitMembership",
    "UserProfile",
    "UserSession",
    "WallRev",
    "ZoneRev",
    "ZoneType",
    "new_id",
]
