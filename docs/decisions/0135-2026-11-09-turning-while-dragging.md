# 0135 — Turning furniture while dragging it

- **Date:** 2026-11-09
- **Status:** Accepted
- **Refines:** [0130](0130-2026-11-08-learning-the-editor.md) (the dragging hint)

## Context
In the floor editor, R turns the selected furniture a quarter turn. While trying the editor, the owner dragged a desk somewhere, pressed R without letting go, and saw it jump back to where it started and turn there. In the owner's words, it "should just spin where it was dragged, and continue being dragged".

That's a bug fix, but it needs two small choices: what each object turns about, and what the hint line says.

Each choice below says whether the owner made it. Those marked *(Claude's choice)* are lower-confidence, and open to change if the owner or users see it differently.

## Decisions
- **R while dragging turns the furniture where it has been dragged to, and the drag carries on.** Letting go saves the move and the turns as one step to undo. *(The owner's choice)*
- **Each object turns about its own centre,** as R does when nothing is dragged. So several selected desks each turn in place, and a monitor on a desk turns on its own spot rather than swinging round with the desk. *(Claude's choice)*
  - The other option was to turn a desk and what's on it as one, with the monitor swinging round the desk's centre. That is what already happens when a dragged desk snaps against a wall ([0047](0047-2026-10-08-snapping.md)). If it's wanted, it should change R when nothing is dragged too, so the two stay the same.
- **A single item is snapped again after it turns,** so a desk turned against a wall still sits flush with it ([0047](0047-2026-10-08-snapping.md)). *(Claude's choice)*
- **The hint line while dragging furniture adds "R turns it where it is",** in English and Hebrew. A column dragged on its own keeps the old hint, since R doesn't turn columns. The Keyboard and mouse sheet's R line says it works while dragging too ([0130](0130-2026-11-08-learning-the-editor.md)). *(Claude's choice)*

## Consequences
- The drag carries R's turn (`spin` on the store's drag state) until it's saved. `dragged()` in `core/store.ts` is the one place that says where a dragged object goes, for saving it and in tests.
- The item tool's placement preview already turned where it was. It doesn't change.
