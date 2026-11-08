# 0129 — How a new user learns the floor editor

- **Date:** 2026-11-08
- **Status:** Accepted
- **Refines:** [0044](0044-2026-10-08-wall-joins.md) (when `Alt` detaches a wall), [0108](0108-2026-10-21-first-client-demo-feedback.md) (moving a whole wall)

## Context
In QA after the first client demo, the owner found that three walls meeting at one corner seemed impossible to separate ([point 7 of the demo notes](../demos/feedback-2026-10-21.md#7-separating-three-walls-at-one-corner-is-hard-to-find)). Holding `Alt` *before* pressing on a selected wall's end does detach just that wall ([0044](0044-2026-10-08-wall-joins.md)). Pressing `Alt` mid-drag does nothing, and nothing on screen says either.

The owner asked how the editor presents its other actions, so that whatever we do for detaching is the same everywhere. Today it uses four ways, none of them consistently:
- **Tooltips on buttons:** the tool letters, `G` for grid snap (with "Hold Alt to place freely"), and `Ctrl+Z` / `Ctrl+Y`.
- **A hint for two tools only:** the zone tool, and the item picker ("R turns it").
- **Labels on the plan while dragging:** what the pointer snapped to. They say what happened, not what you can do.
- **Nothing:** most moves. On 2026-11-08 these couldn't be found from the screen: `Alt` to detach a corner or a whole wall, or to turn snapping off; `Shift` for 45° steps; dragging a selected wall's body to move it; that dragging a corner moves every wall there; the arrow keys (1 cm, 10 cm with `Shift`); typing a number for an exact length; `R` on selected furniture; `Enter`, `Esc` or right-click to end a wall; `Esc` and `Delete`; `Shift`+click; copy and paste (`Ctrl+Shift+V` at the pointer); panning and zooming; dragging a zone's corner; and dragging across seats to number them.

Some admins who draw floors won't be very technical, the owner noted.

## Options considered
For `Alt` pressed mid-drag:
- **It detaches, and the wall stays detached until the drag ends** ✅. Snapping still follows `Alt` as it's held, so you can let go of `Alt` to snap the free end onto another point.
- It follows the key: let go of `Alt` and the walls join again. Then you can't detach and snap.
- Keep it as it is: `Alt` counts only when the button goes down.

For presenting the editor's actions:
- **One hint line for the whole editor, and a sheet of every key and mouse move** ✅
- The hint line only: nowhere to see every key at once.
- The sheet only: people must know to open it, which is today's problem.
- A guided tour on first use: teaches the most, but costs the most and goes stale as the editor changes. Noted for later, below.

A hint or menu just for detaching was set aside: it would be one more pattern, used once.

## Decision
All of it ships in **1.0.0**. It's editor-only; the server doesn't change.

### 1. `Alt` mid-drag detaches
- Pressing `Alt` at any point while dragging a selected wall's end detaches that wall from the corner, as holding it beforehand does. It stays detached until you let go of the mouse, even if you let go of `Alt` first. *(The owner's choice)*
- The same holds for dragging a selected wall by its body: pressing `Alt` mid-drag detaches it from the walls joined to it. *(Claude's choice, so the two drags behave the same)*
- `Alt` still turns snapping off only while it's held ([0047](0047-2026-10-08-snapping.md)).

### 2. One hint line
- One line at the bottom of the canvas always says what you can do now, and which keys change it. It follows the tool, the selection, and what's being dragged. *(The owner's choice)*
- For example, dragging a corner where three walls meet: "Moving 3 walls at this corner. Press Alt to move only this one. Shift: 45° steps." After `Alt`: "Moving only this wall."
- The zone tool's hint and the item picker's hint move into it, so there's one place for hints. *(Claude's choice)*
- The line ends with "All keys (?)", which opens the sheet. *(Claude's choice)*
- It sits at the bottom of the canvas, centred, clear of the grid controls. *(Claude's choice)*

### 3. A sheet of every key and mouse move
- **Keyboard and mouse** lists every move, in groups: tools, selecting and moving, walls, drawing, editing, and the view. It opens with `?`, from the hint line, or from a **?** button in the top bar, next to the version history. *(The owner's choice; where the button sits is Claude's)*
- It's a side panel, like the version history, so the plan stays in view. *(Claude's choice)*

### 4. After 1.0.0
- **A guided tour on first use**, for admins who aren't very technical. *(The owner's request)* A later session designs it, and checks with clients at the next demos whether the hint line and sheet were enough.
- **A user guide** in `docs/tutorials/`, the folder [0075](0075-2026-10-08-docs-directory-structure.md) set aside for user tutorials. It can go with the tour.

## Consequences
- Every editor move needs a line in the sheet, and a hint where it applies. A new move without them is unfinished, as one without its Hebrew text is.
- The hints are worked out from the editor's state in one place (`core/hints.ts`), so they can be tested without a browser.
- [Point 7 of the demo notes](../demos/feedback-2026-10-21.md#7-separating-three-walls-at-one-corner-is-hard-to-find) is decided here.
