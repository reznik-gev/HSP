# 0045 — Dimension entry: inline typing + properties panel

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **Inline typing + properties panel** ✅
- Properties panel only
- Inline typing only

## Decision
- **Inline (CAD-style):** while drawing a wall or moving an element, typing a number opens a small input at the cursor. Examples:
  - `350 ↵` draws a 350 cm segment in the current direction
  - `350<90 ↵` sets length and angle
  - `Tab` cycles between length and angle
  
  While moving, typing applies an exact offset along the drag direction.
- **Properties panel:** shows editable fields for the selection, such as X, Y, Z, rotation, length, thickness, height, sill, offset, label and allocation mode. With a multi-selection, shared values are editable and differing ones show as "mixed".
- **On-canvas dimensions:** the selected wall shows its length, and a selected object shows its distance to the nearest walls. Clicking a dimension label edits it in place.
- Input parsing and display follow the unit rules in [0046](0046-2026-10-08-display-units.md).

## Consequences
- Every value a user types is rounded to whole mm on entry. The UI never produces off-grid values ([0029](0029-2026-10-08-geometry-representation.md)).
- Keyboard-heavy drafting is supported, and the panel keeps it discoverable.
