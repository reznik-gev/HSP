# 0029 — Geometry representation: PostGIS on a millimetre grid, yaw in 0.1°

- **Date:** 2026-10-08
- **Status:** Accepted
- **Refines:** [0004](0004-2026-10-07-space-authoring-model.md), [0012](0012-2026-10-08-database.md)

## Options considered
**Geometry source of truth:**
- **PostGIS geometry, mm grid** ✅
- Integer columns authoritative, PostGIS derived

**Rotation:**
- **Yaw only, integer tenths of a degree** ✅
- Yaw only, float degrees
- Full 3D (yaw/pitch/roll)

## Decision
### Coordinates
- Geometry is stored as PostGIS `geometry` with **SRID 0** in the **floor's local coordinate system**. Units are **millimetres**: +X east on the plan, +Y north on the plan, +Z up from the floor slab.
- Each floor stores its origin offset and elevation relative to its building, so floors can be stacked in a 3D building view.
- Every coordinate must be a whole millimetre. This is enforced by a `CHECK (ST_Equals(geom, ST_SnapToGrid(geom, 1)))` constraint and by the API's Pydantic validators, which take integer mm.
- Doubles represent integers exactly up to 2⁵³ mm, so storage loses no precision.

### Types per element
| Element | Geometry |
|---|---|
| Wall | `LINESTRING` (centreline, 2 points) + `thickness_mm`, `height_mm` |
| Opening (door/window) | No own geometry: `offset_mm` along the host wall + `width_mm`, `height_mm`, `sill_mm` |
| Column | `POLYGON` footprint + `height_mm` |
| Zone | `POLYGON` (no holes in v1) |
| Placed object | `POINT Z` (anchor = footprint centre at its base) + `rotation_ddeg` |

### Rotation
- Rotation is **yaw only**, around the vertical axis, stored as `smallint` **tenths of a degree** in `[0, 3600)`, counter-clockwise from +X.
- Object footprints are derived as rotated rectangles or shapes from the catalog dimensions ([0021](0021-2026-10-08-object-catalog.md)). They're computed in SQL or Shapely for collision and zone checks.

## Consequences
- The API, frontend and DB all use integer mm and decidegrees. Only the UI converts to cm, m and °.
- Pitch and roll (tilted monitors, angled mounts) are out of scope. If needed later, they'd be added as new columns.
- Snapping rules in the editor (grid, wall endpoints, angles) produce values that already satisfy the constraint. The server rejects anything that doesn't.
