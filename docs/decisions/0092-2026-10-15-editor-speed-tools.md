# 0092 — Editor speed tools (frontend phase 3b)

- **Date:** 2026-10-15
- **Status:** Accepted
- **Refines:** [0089](0089-2026-10-15-floor-editor.md) (its 3b step), [0044](0044-2026-10-08-wall-joins.md), [0045](0045-2026-10-08-dimension-entry.md), [0047](0047-2026-10-08-snapping.md), [0049](0049-2026-10-08-bulk-layout-tools.md), [0051](0051-2026-10-08-validation-feedback.md)

## Context
Phase 3a ([0089](0089-2026-10-15-floor-editor.md), [0090](0090-2026-10-15-problems-panel.md)) is merged: an admin can draw a floor, label seats and publish. Phase 3b makes that fast. What each tool does was decided in [0044](0044-2026-10-08-wall-joins.md)–[0051](0051-2026-10-08-validation-feedback.md); 0089 left the PR list for when 3a was merged. The product owner approved this list; the assistant decides small UI details and asks when genuinely unsure.

## Phase 3b PR sequence (stacked, [0079](0079-2026-10-08-stacked-pr-workflow.md))
1. **Drawing snaps** ([0047](0047-2026-10-08-snapping.md)): wall endpoints, then midpoints, then centrelines (snapping onto one makes a T-junction, [0044](0044-2026-10-08-wall-joins.md)), then the grid. The grid size (1, 5, 10 or 50 cm) is chosen on the canvas and **saved with the user's preferences**, which gain a `grid_mm` field. `G` toggles grid snap; holding `Alt` turns all snapping off. A marker and a short label show what the pointer snapped to. Used by every drawing tool and every drag.
2. **Furniture snaps** ([0047](0047-2026-10-08-snapping.md)): face snap (an item sits flush against a wall face and turns to face away from it) and attach snap (an item with `attaches_to` lands on a compatible host and is attached to it).
3. **Typed measurements at the cursor** ([0045](0045-2026-10-08-dimension-entry.md)): while drawing a wall, typing a length (`350`, `3.5m`) or length and angle (`350<90`, `Tab` switches) places the next corner exactly; while dragging, a typed distance moves exactly that far along the drag.
4. **Dimensions on the plan** ([0045](0045-2026-10-08-dimension-entry.md)): the selected wall shows its length and a selected item its distances to the nearest walls; clicking a dimension edits it.
5. **Array** ([0049](0049-2026-10-08-bulk-layout-tools.md)): rows × columns with a spacing, optional mirroring on alternate rows, a live preview, one undo step.
6. **Seat numbering** ([0049](0049-2026-10-08-bulk-layout-tools.md)): a pattern such as `3-B-{01}`, applied in click order or by dragging across seats, skipping labels already used in the building.
7. **Copy and paste between floors** ([0049](0049-2026-10-08-bulk-layout-tools.md)): paste at the same coordinates or at the cursor; new ids, device links dropped, seat labels cleared, openings only with their walls, attached items with their hosts.
8. **Live checks, part 1** ([0051](0051-2026-10-08-validation-feedback.md)): the server's existing changeset rules ([0081](0081-2026-10-10-drafts-and-changesets.md)) as shared JSON cases in `/shared/validation-cases`, run in CI by both the server's `validate()` and a new TypeScript checker in the editor core. Problems appear as the user works, before a change is sent.
9. **Live checks, part 2**: the geometry rules 0081 deferred to the editor phase, in both checkers with shared cases. Partially overlapping zones are **errors**; an item inside a door's swing, an item overlapping a column, and a seat without a label are **warnings**. The server returns warnings in the changeset response; publish runs the full set.

## Consequences
- The Problems panel ([0090](0090-2026-10-15-problems-panel.md)) shows live findings next to refused changes; live findings come and go as the plan changes.
- Preferences gain `grid_mm`, a small backend change in PR 1.
- Every rule exists twice (TypeScript and Python); the shared cases keep them in step, as [0051](0051-2026-10-08-validation-feedback.md) planned.
