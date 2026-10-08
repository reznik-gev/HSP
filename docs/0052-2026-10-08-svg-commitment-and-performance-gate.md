# 0052 — SVG commitment: renderer-agnostic editor core + performance gate

- **Date:** 2026-10-08
- **Status:** Accepted
- **Refines:** [0042](0042-2026-10-08-2d-renderer.md)

## Context
[0042](0042-2026-10-08-2d-renderer.md) chose SVG for the 2D editor. A follow-up review established these points:
- **Precision does not come from the renderer.** Accuracy is guaranteed by integer-mm storage, input rounding and server validation ([0029](0029-2026-10-08-geometry-representation.md), [0045](0045-2026-10-08-dimension-entry.md), [0051](0051-2026-10-08-validation-feedback.md)). Every renderer, SVG included, rasterizes with float32.
- **SVG's real strengths:** DOM-queryable end-to-end tests, export and print for free, devtools inspection, CSS styling and theming, crisp text, and accessibility.
- **SVG's real risks:** a performance *cliff* rather than gradual slowdown. The causes are DOM node counts (~6–10 nodes per seat position, 5k+ nodes on a 400-seat floor), full repaints on pan and zoom, React re-render discipline, costly patterns, filters and text, and future features (heatmaps, live seat status, whole-building views, very large floors) that may cross the cliff.
- **Extra work versus Konva:** about a few weeks of interaction plumbing (transform handles, drag, hit areas, z-order overlays). The hard editor logic is the same with any renderer.

## Decision
1. **SVG is the 2D renderer**, and the product owner explicitly prefers it.
2. **The editor core is renderer-agnostic.** The following live in plain TypeScript working on the client plan store, with **no dependency on SVG, React or the DOM**:
   - tools (draw wall, place object, select, …)
   - selection
   - snapping
   - **geometric hit-testing** against the client spatial index, not DOM events
   - drag and transform maths
   - the operation/undo model ([0050](0050-2026-10-08-undo-redo.md))
   - validation ([0051](0051-2026-10-08-validation-feedback.md))

   The SVG layer is a **thin view**. It renders the store and forwards raw pointer and keyboard events (in plan mm coordinates) to the core.
3. **A performance spike is a gate**, run *before* the editor is built on SVG:
   - Use a synthetic worst-case floor: **1,500 seat positions** (desk + chair + monitors + label), walls with mitred joins, doors with swing arcs, zones with fills, all labels visible, and wall hatching.
   - Measure on a mid-range laptop (integrated graphics) in **Chrome and Safari** (plus Firefox for reference).

   | Interaction | Pass criterion |
   |---|---|
   | Drag 1 object / 20 selected objects | ≥ 50 fps |
   | Pan and wheel-zoom | ≥ 45 fps, no visible blurring longer than 200 ms |
   | Initial render of the floor | ≤ 1.5 s |
   | Select-on-click latency | ≤ 50 ms |
4. The CI performance budget from [0042](0042-2026-10-08-2d-renderer.md) continues as a **regression guard** after the spike.

## If the gate fails, or later regressions can't be fixed
In order of preference:
1. **Hybrid:** move the static layer to `<canvas>`, keeping SVG for the selection, handles and overlays.
2. **Konva** (or another canvas/WebGL utility) for the whole view layer.

Either way, the change replaces **only the view layer**, thanks to decision 2. SVG export is then provided by a separate exporter, and end-to-end tests move to querying the core's state, plus screenshot comparisons. The switch is recorded as a new decision that supersedes [0042](0042-2026-10-08-2d-renderer.md).

## Re-examination triggers (even if the gate passes)
Re-run the spike scenarios, extended with the new feature, before building any of these:
- occupancy or utilization heatmaps
- live seat-status colouring (booking)
- multi-floor or whole-building 2D overviews
- a customer floor with more than 1,500 seat positions

## Consequences
- A small up-front cost: an extra architectural boundary, plus about one week of spike work.
- The performance risk is caught **before** editor code exists, not after.
- The editor core can be unit-tested headlessly (no DOM) for tools, snapping and hit-testing, while SVG's DOM keeps end-to-end tests simple.
