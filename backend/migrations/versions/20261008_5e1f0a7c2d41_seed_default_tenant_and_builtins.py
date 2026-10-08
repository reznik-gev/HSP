"""seed default tenant, zone types and built-in catalog (docs/0003, 0020, 0021, 0034-E)

v1 has exactly one tenant (slug "default"). Built-in catalog items have tenant_id NULL and are
identified by `key`; later migrations update them by key, never by id.

Revision ID: 5e1f0a7c2d41
Revises: c9b2fc969b7d
Create Date: 2026-10-08 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from uuid_utils.compat import uuid7

revision: str = "5e1f0a7c2d41"
down_revision: str | Sequence[str] | None = "c9b2fc969b7d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

tenant = sa.table(
    "tenant", sa.column("id", sa.Uuid), sa.column("name", sa.String), sa.column("slug", sa.String)
)
zone_type = sa.table(
    "zone_type",
    sa.column("id", sa.Uuid),
    sa.column("tenant_id", sa.Uuid),
    sa.column("name", sa.String),
    sa.column("is_enclosed", sa.Boolean),
    sa.column("color", sa.String),
)
catalog_item = sa.table(
    "catalog_item",
    sa.column("id", sa.Uuid),
    sa.column("tenant_id", sa.Uuid),
    sa.column("key", sa.String),
    sa.column("category", sa.String),
    sa.column("name", sa.String),
)
catalog_item_rev = sa.table(
    "catalog_item_rev",
    sa.column("id", sa.Uuid),
    sa.column("tenant_id", sa.Uuid),
    sa.column("item_id", sa.Uuid),
    sa.column("rev_no", sa.Integer),
    sa.column("shape", sa.String),
    sa.column("width_mm", sa.Integer),
    sa.column("depth_mm", sa.Integer),
    sa.column("height_mm", sa.Integer),
    sa.column("color", sa.String),
    sa.column("is_seat", sa.Boolean),
    sa.column("mountable", sa.Boolean),
    sa.column("attaches_to_categories", postgresql.ARRAY(sa.String)),
    sa.column("footprint_blocks", sa.Boolean),
)

ZONE_TYPES = [
    # name, is_enclosed, color
    ("Room", True, "#93c5fd"),
    ("Meeting room", True, "#c4b5fd"),
    ("Wing", False, "#fde68a"),
    ("Pod", False, "#86efac"),
    ("Core", True, "#d1d5db"),
]

# key, category, name, shape, W, D, H (mm), color, is_seat, mountable, attaches_to, blocks
BUILTINS = [
    (
        "desk_1600x800",
        "desk",
        "Desk 160 x 80",
        "box",
        1600,
        800,
        740,
        "#e7e5e4",
        True,
        False,
        [],
        True,
    ),
    (
        "desk_1400x700",
        "desk",
        "Desk 140 x 70",
        "box",
        1400,
        700,
        740,
        "#e7e5e4",
        True,
        False,
        [],
        True,
    ),
    (
        "desk_1800x900",
        "desk",
        "Desk 180 x 90",
        "box",
        1800,
        900,
        740,
        "#e7e5e4",
        True,
        False,
        [],
        True,
    ),
    (
        "sit_stand_desk_1600x800",
        "desk",
        "Sit-stand desk 160 x 80",
        "box",
        1600,
        800,
        740,
        "#d6d3d1",
        True,
        False,
        [],
        True,
    ),
    (
        "task_chair",
        "chair",
        "Task chair",
        "cylinder",
        650,
        650,
        1050,
        "#44403c",
        False,
        False,
        [],
        False,
    ),
    (
        "meeting_table_2400x1200",
        "table",
        "Meeting table 240 x 120",
        "box",
        2400,
        1200,
        740,
        "#e7e5e4",
        False,
        False,
        [],
        True,
    ),
    (
        "monitor_24",
        "monitor",
        'Monitor 24"',
        "box",
        540,
        200,
        420,
        "#1c1917",
        False,
        True,
        ["desk"],
        False,
    ),
    (
        "monitor_27",
        "monitor",
        'Monitor 27"',
        "box",
        615,
        220,
        460,
        "#1c1917",
        False,
        True,
        ["desk"],
        False,
    ),
    (
        "wall_tv_65",
        "monitor",
        'Wall display 65"',
        "box",
        1450,
        60,
        830,
        "#1c1917",
        False,
        True,
        [],
        False,
    ),
    (
        "docking_station",
        "device",
        "Docking station",
        "box",
        200,
        80,
        30,
        "#57534e",
        False,
        False,
        ["desk"],
        False,
    ),
    (
        "desk_phone",
        "device",
        "Desk phone",
        "box",
        200,
        180,
        90,
        "#57534e",
        False,
        False,
        ["desk"],
        False,
    ),
    (
        "printer_mfp",
        "device",
        "Multifunction printer",
        "box",
        600,
        650,
        1150,
        "#a8a29e",
        False,
        False,
        [],
        True,
    ),
    (
        "pedestal_cabinet",
        "storage",
        "Pedestal cabinet",
        "box",
        420,
        600,
        600,
        "#a8a29e",
        False,
        False,
        [],
        True,
    ),
    (
        "locker_tall",
        "storage",
        "Tall locker",
        "box",
        400,
        500,
        1800,
        "#a8a29e",
        False,
        False,
        [],
        True,
    ),
    (
        "plant_large",
        "decor",
        "Large plant",
        "cylinder",
        500,
        500,
        1500,
        "#16a34a",
        False,
        False,
        [],
        True,
    ),
]


def upgrade() -> None:
    tenant_id = uuid7()
    op.bulk_insert(tenant, [{"id": tenant_id, "name": "Default organization", "slug": "default"}])
    op.bulk_insert(
        zone_type,
        [
            {"id": uuid7(), "tenant_id": tenant_id, "name": n, "is_enclosed": e, "color": c}
            for n, e, c in ZONE_TYPES
        ],
    )

    items, revs = [], []
    for key, cat, name, shape, w, d, h, color, seat, mount, attaches, blocks in BUILTINS:
        item_id = uuid7()
        items.append({"id": item_id, "tenant_id": None, "key": key, "category": cat, "name": name})
        revs.append(
            {
                "id": uuid7(),
                "tenant_id": None,
                "item_id": item_id,
                "rev_no": 1,
                "shape": shape,
                "width_mm": w,
                "depth_mm": d,
                "height_mm": h,
                "color": color,
                "is_seat": seat,
                "mountable": mount,
                "attaches_to_categories": attaches,
                "footprint_blocks": blocks,
            }
        )
    op.bulk_insert(catalog_item, items)
    op.bulk_insert(catalog_item_rev, revs)


def downgrade() -> None:
    op.execute(
        "DELETE FROM catalog_item_rev WHERE item_id IN "
        "(SELECT id FROM catalog_item WHERE tenant_id IS NULL)"
    )
    op.execute("DELETE FROM catalog_item WHERE tenant_id IS NULL")
    op.execute(
        "DELETE FROM zone_type WHERE tenant_id = (SELECT id FROM tenant WHERE slug = 'default')"
    )
    op.execute("DELETE FROM tenant WHERE slug = 'default'")
