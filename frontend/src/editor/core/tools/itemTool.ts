/**
 * The item tool (docs/0021, docs/0089): pick a catalog item in the side panel, then each click
 * places one where the pointer is, turned as shown (R turns it a quarter). It snaps against
 * wall faces and onto compatible hosts (docs/0047, see furnitureSnap.ts). Desks and other
 * seats start as assigned seats without a label (docs/0009).
 */
import { addObject } from "../edits";
import { placeItem } from "../furnitureSnap";
import type { Vec2 } from "../plan";
import { snapSettings } from "../snap";
import type { EditorStore } from "../store";

export class ItemTool {
  constructor(private readonly store: EditorStore) {}

  private place(p: Vec2) {
    const s = this.store.getState();
    if (!s.placing || !s.plan) return null;
    return placeItem(s.plan, s.placing, p, s.placingRotation, snapSettings(s, s.snapFree));
  }

  hover(p: Vec2): void {
    const placed = this.place(p);
    if (!placed) return;
    this.store.getState().setPreview({
      kind: "item",
      at: placed.at,
      rotation_ddeg: placed.rotation_ddeg,
      snap: placed.snap,
    });
  }

  click(p: Vec2): void {
    const s = this.store.getState();
    const placed = this.place(p);
    if (!placed || !s.placing) return;
    s.ensureCatalog(s.placing);
    s.perform([addObject(s.placing, placed.at, placed.rotation_ddeg, placed.attachedTo)]);
  }
}
