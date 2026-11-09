# 0133 — Selecting with a rectangle: Shift+drag in Select

- **Date:** 2026-11-09
- **Status:** Accepted
- **Refines:** [0042](0042-2026-10-08-2d-renderer.md) (rubber-band selection)

## Context
In the floor editor's Select tool, a click selects one element and Shift+click adds one more. Dragging empty space pans the plan. [0042](0042-2026-10-08-2d-renderer.md) planned rubber-band selection, but it was never built. So picking a room's worth of desks meant Shift+clicking each one.

Holding Shift and dragging now draws a selection rectangle. The owner chose the first four answers below. The rest are *(Claude's choice)*: lower-confidence, and open to change if the owner or users see it differently.

## Decisions
- **The rectangle catches only what's fully inside it,** whichever way you drag. One simple rule. Long walls and large zones need a rectangle around all of them. *(The owner's choice)*
- **It adds to the selection,** like Shift+click. Several rectangles build one selection. To start over, press Esc or click empty space first. *(The owner's choice)*
- **Shift+drag always draws a rectangle, wherever it starts,** on an item, a wall, a zone or empty space. In a furnished floor almost every spot is on a desk or inside a zone, so starting only from empty space would rarely work. Shift+click without moving still adds the one element under the pointer. To move things, drag without Shift. *(The owner's choice)*
  - The handles of a selected wall's end or a selected zone's corner keep their drag, because Shift there already keeps a wall straight ([0108](0108-2026-10-21-first-client-demo-feedback.md)).
- **It catches every kind:** walls, doors and windows, columns, zones, and items, seats included. **The height filter counts:** with Floor or Raised on, the faded items aren't caught ([0095](0095-2026-10-16-heights-catalog-and-devices.md)). Walls, openings, columns and zones are never faded, so they're always caught. Items attached to a caught item (a monitor on a desk) come with it, as with a click ([0047](0047-2026-10-08-snapping.md)). *(The owner's choice)*
- **Nothing is locked or hidden** in the editor: the only lock is the whole floor's editing lock ([0016](0016-2026-10-08-edit-concurrency.md)). So there's no rule to make about them. If element locks or hiding come later, they'll need one.
- **"Fully inside"** means the element's whole outline: a wall with its thickness, a door or window's span of its wall, a column's or zone's corners, an item's turned footprint. *(Claude's choice)*
- **An attached item fully inside is caught on its own,** even when its host isn't: a click on it selects it alone too. *(Claude's choice)*
- **The look:** a thin solid line in the selection colour, with a light fill of the same colour, one screen pixel wide at any zoom. *(Claude's choice)*
- **Only the start needs Shift.** Letting go of Shift during the drag keeps drawing the rectangle. **Esc** during the drag drops it and selects nothing. *(Claude's choice)*
- **The selection changes when you let go,** not while dragging. Nothing is highlighted along the way. *(Claude's choice)*

## Consequences
- Shift+drag no longer moves an item or pans. Moving a selection is a plain drag.
- The "Keyboard and mouse" sheet lists Shift+drag, and the Select hint mentions it ([0130](0130-2026-11-08-learning-the-editor.md)).
- The rectangle is drawn by the view from a `box` preview, like the other tools' previews ([0052](0052-2026-10-08-svg-commitment-and-performance-gate.md)). The core decides what it catches (`inBox` in `hitTest.ts`), so it's tested without a browser.
