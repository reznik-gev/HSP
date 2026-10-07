# 0032 — Architectural elements in v1: walls, openings, columns

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **Walls + doors/windows (+ columns)** ✅
- Walls only
- Zone outlines only

## Decision
v1 models these elements on a floor:
- **Walls:** straight segments (centreline, thickness, height). Curved walls are approximated by several segments.
- **Openings:** doors and windows hosted on a wall: `offset_mm` from the wall start, `width_mm`, `height_mm`, `sill_mm` (0 for doors), and for doors a **swing** (hinge side + direction, or sliding/none).
- **Columns:** fixed polygonal obstacles with a height.

## Consequences
- The 3D view extrudes walls and cuts openings, so rooms look realistic.
- Clearance checks can respect door swing arcs and columns. For example: "desk blocks door swing" is a warning.
- An opening must lie fully within its host wall (`offset + width <= wall length`). Moving or shortening a wall revalidates its openings.
- Openings reference their host wall's **stable element ID**. Deleting a wall in a draft deletes its openings in the same draft.
- Stairs, elevators and curved walls are out of scope for v1. Stair and elevator cores can be drawn as zones of a dedicated type.
