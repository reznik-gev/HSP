/**
 * The seat-numbering tool (docs/0049): click seats in order, or drag across them, and each
 * gets the next label of the pattern, skipping labels already taken in the building. A click
 * or a drag is one undo step; the counter carries on to the next one.
 */
import type { Op } from "../operations";
import { floorLabels, nextFree, parsePattern, seatAt } from "../numbering";
import type { Vec2 } from "../plan";
import type { EditorStore } from "../store";

export class NumberTool {
  /** Seats numbered in the current click or drag, in order, with their labels. */
  private pending: { id: string; label: string }[] = [];
  private counter = 0;

  constructor(private readonly store: EditorStore) {}

  begin(p: Vec2): void {
    this.pending = [];
    this.counter = this.store.getState().numbering.next;
    this.add(p);
  }

  /** The pointer passed over `p` while pressed. */
  extend(p: Vec2): void {
    this.add(p);
  }

  private add(p: Vec2): void {
    const s = this.store.getState();
    const pattern = parsePattern(s.numbering.pattern);
    if (!s.plan || !s.hitIndex || !pattern) return;
    const id = seatAt(s.plan, s.hitIndex, p, 2 * s.viewport.mmPerPx);
    if (!id || this.pending.some((x) => x.id === id)) return;
    // Taken: elsewhere in the building, by other seats here, or earlier in this drag.
    const numbered = new Set(this.pending.map((x) => x.id));
    const taken = new Set([
      ...s.takenLabels,
      ...floorLabels(s.plan, new Set([id, ...numbered])),
      ...this.pending.map((x) => x.label),
    ]);
    const { label, n } = nextFree(pattern, this.counter, taken);
    this.pending.push({ id, label });
    this.counter = n + 1;
    s.setPreview({ kind: "numbering", seats: [...this.pending] });
  }

  /** Applies the labels as one undo step. */
  end(): void {
    const s = this.store.getState();
    s.setPreview(null);
    const ops: Op[] = this.pending
      .filter((x) => s.plan?.objects[x.id]?.label !== x.label)
      .map((x) => ({ op: "update", kind: "object", id: x.id, data: { label: x.label } }));
    if (this.pending.length) s.setNumbering({ next: this.counter });
    this.pending = [];
    if (ops.length) s.perform(ops);
  }
}
