# 0043 — Editor view layout: 2D main, 3D toggle or split

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **2D main + 3D toggle/split** ✅
- Always side by side
- Editable in both 2D and 3D

## Decision
- The **2D plan is the only editing surface** in v1.
- A toolbar switch offers three modes: **2D**, **3D** (full screen), and **Split** (resizable 2D | 3D).
- In Split mode the 3D view (R3F, [0011](0011-2026-10-08-frontend-stack.md)) **follows the selection**: it highlights the selected elements and offers "frame selection". It reflects unsaved edits live from the editor's local state.
- 3D supports orbit, pan and zoom, a walk-through camera at eye height (1,600 mm), and clicking to select (which syncs the selection to 2D).
- Vertical values (object `z`, wall height, sill height) are edited in the 2D properties panel ([0045](0045-2026-10-08-dimension-entry.md)).

## Consequences
- 3D only reads from the plan model, so there's no second interaction system. Moving objects in 3D can be added later.
- Both views render from **the same client-side plan store**, so they can't disagree.
