/**
 * The item tool (docs/0021, docs/0089): pick a catalog item in the side panel, then each click
 * places one, centred on the pointer (snapped to the grid) and turned as shown; R turns it a
 * quarter. Desks and other seats start as assigned seats without a label (docs/0009).
 */
import { addObject } from "../edits";
import type { Vec2 } from "../plan";
import type { EditorStore } from "../store";

export class ItemTool {
  constructor(private readonly store: EditorStore) {}

  private snap(p: Vec2): Vec2 {
    const s = this.store.getState();
    const g = s.gridMm;
    return s.gridSnap
      ? [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g]
      : [Math.round(p[0]), Math.round(p[1])];
  }

  hover(p: Vec2): void {
    const s = this.store.getState();
    if (!s.placing) return;
    s.setPreview({ kind: "item", at: this.snap(p), rotation_ddeg: s.placingRotation });
  }

  click(p: Vec2): void {
    const s = this.store.getState();
    if (!s.placing || !s.plan) return;
    s.ensureCatalog(s.placing);
    s.perform([addObject(s.placing, this.snap(p), s.placingRotation)]);
  }
}
