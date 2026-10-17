"""Geometry checks over a whole plan (docs/0051, docs/0081, docs/0092 step 9).

Errors (they block a changeset that touches the elements):
- ``zone_overlap``: two zones overlap partly, neither inside the other and neither nested in
  the other; reported on both zones.
- ``zone_outside_parent``: a nested zone isn't wholly inside its parent (docs/0020, docs/0034
  invariant 1); reported on the child, with the parent related, so changing either is refused.

Warnings (allowed, shown to the editor):
- ``item_in_door_swing``: an item that takes floor space stands where a door swings open;
- ``item_over_column``: an item that takes floor space overlaps a column;
- ``seat_without_label``: a seat has no label yet.

The editor runs the same rules (frontend/src/editor/core/checks.ts) and both run the shared
cases in /shared/validation-cases. "Overlap" means an intersection of more than 1 mm², and
"inside" covering all but 1 mm², on both sides, so rooms that only share a wall line don't
overlap.
"""

import math
import uuid
from collections.abc import Mapping

from shapely.geometry import Polygon

from hsp.plans.schema import CatalogItem, Opening, PlacedObject, PlanContent, Wall, Zone
from hsp.problems import ProblemError

AREA_EPS = 1.0  # mm²
#: Segments in a door's quarter-circle swing; the editor uses the same.
SWING_SEGMENTS = 8


def _problem(code: str, message: str, element: uuid.UUID, related: uuid.UUID) -> ProblemError:
    return ProblemError(
        code=code, message=message, element_id=str(element), related_ids=[str(related)]
    )


def _polygon(points: list[tuple[float, float]]) -> Polygon | None:
    poly = Polygon(points)
    return poly if poly.is_valid and poly.area > 0 else None


def _overlap(a: Polygon, b: Polygon) -> float:
    return float(a.intersection(b).area)


def _item_rect(obj: PlacedObject, item: CatalogItem) -> Polygon:
    r = math.radians(obj.rotation_ddeg / 10)
    cos, sin = math.cos(r), math.sin(r)
    w, d = item.width_mm / 2, item.depth_mm / 2
    x, y = obj.position[0], obj.position[1]
    corners = [(-w, -d), (w, -d), (w, d), (-w, d)]
    return Polygon([(x + px * cos - py * sin, y + px * sin + py * cos) for px, py in corners])


def door_swing(opening: Opening, wall: Wall) -> list[tuple[float, float]] | None:
    """The floor a door sweeps: a quarter circle about its hinge, or None if it doesn't swing."""
    if opening.type != "door" or opening.swing in ("sliding", "none"):
        return None
    length = math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
    if length == 0:
        return None
    ux, uy = (wall.b[0] - wall.a[0]) / length, (wall.b[1] - wall.a[1]) / length
    start = (wall.a[0] + ux * opening.offset_mm, wall.a[1] + uy * opening.offset_mm)
    end = (start[0] + ux * opening.width_mm, start[1] + uy * opening.width_mm)
    hinge_at_start = opening.swing.startswith("left")
    hinge, other = (start, end) if hinge_at_start else (end, start)
    # Closed: the leaf lies along the wall towards the other jamb. Open: square to the wall,
    # into the room on the "in" side (the wall's left, looking from a to b).
    cx, cy = (other[0] - hinge[0]) / opening.width_mm, (other[1] - hinge[1]) / opening.width_mm
    side = 1 if opening.swing.endswith("_in") else -1
    nx, ny = -uy * side, ux * side
    r = opening.width_mm
    points = [hinge]
    for i in range(SWING_SEGMENTS + 1):
        t = (math.pi / 2) * i / SWING_SEGMENTS
        points.append(
            (
                hinge[0] + r * (math.cos(t) * cx + math.sin(t) * nx),
                hinge[1] + r * (math.cos(t) * cy + math.sin(t) * ny),
            )
        )
    return points


def _ancestors(zone: Zone, zones: Mapping[uuid.UUID, Zone]) -> set[uuid.UUID]:
    found: set[uuid.UUID] = set()
    cursor = zones.get(zone.parent_zone_id) if zone.parent_zone_id else None
    while cursor is not None and cursor.id not in found:
        found.add(cursor.id)
        cursor = zones.get(cursor.parent_zone_id) if cursor.parent_zone_id else None
    return found


def zone_errors(plan: PlanContent) -> list[ProblemError]:
    zones = {z.id: z for z in plan.zones}
    shapes = {z.id: _polygon([(p[0], p[1]) for p in z.boundary]) for z in plan.zones}
    problems: list[ProblemError] = []
    for zone in plan.zones:
        parent = zones.get(zone.parent_zone_id) if zone.parent_zone_id else None
        child_shape = shapes[zone.id]
        parent_shape = shapes[parent.id] if parent else None
        if parent is None or child_shape is None or parent_shape is None:
            continue  # reference_missing or polygon_invalid covers it
        if _overlap(child_shape, parent_shape) < child_shape.area - AREA_EPS:
            problems.append(
                _problem(
                    "zone_outside_parent",
                    f"{zone.name} isn't wholly inside {parent.name}.",
                    zone.id,
                    parent.id,
                )
            )
    ordered = sorted(plan.zones, key=lambda z: z.id)
    for i, a in enumerate(ordered):
        for b in ordered[i + 1 :]:
            pa, pb = shapes[a.id], shapes[b.id]
            if pa is None or pb is None:
                continue  # polygon_invalid covers it
            if a.id in _ancestors(b, zones) or b.id in _ancestors(a, zones):
                continue  # nested on purpose
            shared = _overlap(pa, pb)
            inside = shared >= pa.area - AREA_EPS or shared >= pb.area - AREA_EPS
            if shared > AREA_EPS and not inside:
                for zone, other in ((a, b), (b, a)):
                    problems.append(
                        _problem(
                            "zone_overlap",
                            f"{zone.name} partly overlaps {other.name}.",
                            zone.id,
                            other.id,
                        )
                    )
    return problems


def warnings(plan: PlanContent, catalog: Mapping[uuid.UUID, CatalogItem]) -> list[ProblemError]:
    walls = {w.id: w for w in plan.walls}
    swings = []
    for o in plan.openings:
        wall = walls.get(o.wall_id)
        points = door_swing(o, wall) if wall else None
        shape = _polygon(points) if points else None
        if shape is not None:
            swings.append((o, shape))
    columns = [(c, _polygon([(p[0], p[1]) for p in c.footprint])) for c in plan.columns]

    found: list[ProblemError] = []
    for obj in plan.objects:
        item = catalog.get(obj.catalog_item_rev_id)
        if item is None:
            continue
        if item.is_seat and not obj.label:
            found.append(
                ProblemError(
                    code="seat_without_label",
                    message="This seat has no label yet.",
                    element_id=str(obj.id),
                )
            )
        if not item.footprint_blocks or obj.attached_to is not None:
            continue
        rect = _item_rect(obj, item)
        for door, swing in swings:
            if _overlap(rect, swing) > AREA_EPS:
                found.append(
                    _problem(
                        "item_in_door_swing",
                        f"{item.name} stands where a door opens.",
                        obj.id,
                        door.id,
                    )
                )
        for column, shape in columns:
            if shape is not None and _overlap(rect, shape) > AREA_EPS:
                found.append(
                    _problem(
                        "item_over_column", f"{item.name} overlaps a column.", obj.id, column.id
                    )
                )
    return found
