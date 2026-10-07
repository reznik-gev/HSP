# 0021 — Furniture & device catalog: built-in library + parametric items

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- Built-in + parametric + glTF upload
- **Built-in + parametric** ✅
- Parametric only

## Decision
- HSM ships a **built-in catalog** of common items (desks of standard sizes, chairs, monitors, docking stations, phones, printers, cabinets, plants…), each with exact dimensions in mm and a bundled low-poly 3D model.
- Admins can define **parametric catalog items**: a primitive shape (box, cylinder, L-shape), W × D × H in cm, color, icon, category and flags.
- Each catalog item declares **capabilities** that drive behavior:
  - `is_seat`: can be assigned or booked ([0009](0009-2026-10-07-seat-assignment-model.md))
  - `mountable`: may have a non-zero `z` (e.g. a wall- or arm-mounted monitor)
  - `attaches_to`: e.g. a monitor attaches to a desk and moves with it
  - `footprint_blocks`: takes part in collision and clearance checks
- Placed objects reference a catalog item and store position (x, y, z), rotation and optional per-instance overrides.

## Consequences
- No user-uploaded 3D files in v1, so there's no asset storage, sanitization or size limits to handle. glTF/GLB upload can be added later as another item kind.
- Built-in models are bundled with the frontend for air-gapped installs ([0005](0005-2026-10-07-deployment-model.md)).
- Changing a catalog item's dimensions affects every placement, so dimension changes create a new catalog item revision and existing placements keep the old revision until updated.
