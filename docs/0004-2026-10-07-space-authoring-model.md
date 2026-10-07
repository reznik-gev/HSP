# 0004 — Space authoring: 2D floor plan extruded to 3D

- **Date:** 2026-10-07
- **Status:** Accepted

## Context
Managers need to define spaces with 1 cm precision and see them in 3D. The authoring paradigm drives most of the front-end effort.

## Options considered
| Option | Notes |
|---|---|
| **2D plan → extruded 3D** ✅ | Draw walls and rooms in 2D with numeric dimensions and heights. 3D is generated. Objects are placed in 2D or 3D. Easiest for managers, and the pattern is proven. |
| Full 3D editor | Most flexible (mezzanines, mounted devices) but much more engineering and a steeper learning curve. |
| Import CAD/BIM + annotate | Highest fidelity, but depends on having IFC/DWG source files. |
| 2D/3D + import combined | Covers both cases but adds scope. |

## Decision
The primary authoring flow is a **2D floor-plan editor with numeric input**. A **3D view is generated** from wall polygons, heights and placed objects.

## Consequences
- **Units:** all lengths are stored as integer **millimetres** (one order of magnitude below the 1 cm requirement), which avoids floating-point drift. The UI displays and accepts cm, or m with 2 decimals.
- **Geometry model:** floors have an origin and a local coordinate system. Walls are polylines with thickness and height. Rooms and zones are polygons. Objects (seats, desks, monitors, devices) have position (x, y, z), rotation and a reference to a catalog item that carries dimensions and a 3D asset.
- Vertical placement (for example, a wall-mounted monitor at 140 cm) is supported through the object's `z` and is editable numerically or in the 3D view.
- CAD/IFC import is **not** in v1, but the geometry model shouldn't preclude adding it later.
