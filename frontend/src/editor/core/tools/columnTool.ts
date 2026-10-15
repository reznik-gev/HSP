/**
 * The column tool: click to place a 40 × 40 cm column, centred on the snapped point (wall ends,
 * then the grid) and as tall as the walls. Its size changes in the Properties panel.
 */
import { addColumn, squareAround } from "../edits";
import type { Vec2 } from "../plan";
import { snapPoint } from "../snap";
import type { EditorStore } from "../store";

export class ColumnTool {
  constructor(private readonly store: EditorStore) {}

  private snap(p: Vec2) {
    const s = this.store.getState();
    return snapPoint(s.plan!, p, {
      mmPerPx: s.viewport.mmPerPx,
      gridMm: s.gridMm,
      gridSnap: s.gridSnap,
    });
  }

  hover(p: Vec2): void {
    if (!this.store.getState().plan) return;
    const { point, kind } = this.snap(p);
    this.store
      .getState()
      .setPreview({ kind: "column", footprint: squareAround(point), snap: kind });
  }

  click(p: Vec2): void {
    const s = this.store.getState();
    if (!s.plan) return;
    s.perform([addColumn(squareAround(this.snap(p).point), s.wallDefaults.height_mm)]);
  }
}
