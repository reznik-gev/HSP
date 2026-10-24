# 0117 — Seat labels on the plan are drawn without font hinting

- **Date:** 2026-10-24
- **Status:** Accepted

## Context
A seat's label on the plan ([0042](0042-2026-10-08-2d-renderer.md)) sits on a box, measured once at one zoom. By default the browser hints text: it nudges letter shapes and spacing to fit whole screen pixels. Hinted text is a different width in plan units at each zoom, and grows wider as the plan zooms out. On Linux it reached up to 1.83 px past its box, and failed the release test about one run in four. The [investigation](../investigations/2026-10-24-flaky-release-tests.md) has the measurements.

## Options considered
| Option | Chosen | Why |
|---|---|---|
| Keep hinting, measure the label again whenever the zoom changes | | Every label updates on every scroll of the wheel. The plan view is built not to redraw plan elements while panning and zooming. |
| Keep hinting, more padding around the label | | Only moves the line: the miss grows with how far the zoom changes. |
| **Draw labels without hinting (`text-rendering: geometricPrecision`)** | ✅ (Claude's choice, lower confidence) | The text keeps its width at every zoom, so the box always fits. One line of CSS. |

## Decision
- Seat labels on the plan use `text-rendering: geometricPrecision`.

## Consequences
- The box fits its label at every zoom.
- Unhinted text can look a touch softer at small sizes. Labels sit on a halo and a box, so it should hardly show. If someone finds them too soft, this is the record to revisit, and the options above are the alternatives.
