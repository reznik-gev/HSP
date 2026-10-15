/**
 * Read-only plan interaction (docs/0087): dragging always pans, a click selects the seat under
 * the pointer (or clears the selection), and hovering reports which seat is under the pointer.
 * Nothing can be moved. Renderer-agnostic like `Interaction` (docs/0052).
 */
import { isSeat } from "./fromApi";
import { hitTest } from "./hitTest";
import type { PointerInput } from "./interaction";
import { isClick, PanZoom } from "./panZoom";
import type { Vec2 } from "./plan";
import type { EditorStore } from "./store";

export class ViewerInteraction {
  private readonly view: PanZoom;
  private downAt: Vec2 | null = null;

  constructor(private readonly store: EditorStore) {
    this.view = new PanZoom(store);
  }

  setSize(width: number, height: number): void {
    this.view.setSize(width, height);
  }

  pointerDown(e: PointerInput): "pan" | "none" {
    if (e.button !== 0 && e.button !== 1) return "none";
    this.downAt = [e.sx, e.sy];
    this.view.startPan(e.sx, e.sy);
    return "pan";
  }

  pointerMove(e: PointerInput): void {
    this.view.movePan(e.sx, e.sy);
  }

  pointerUp(e: PointerInput): void {
    const down = this.downAt;
    this.downAt = null;
    this.view.endPan();
    if (!down || e.button !== 0 || !isClick(down, e.sx, e.sy)) return; // a pan
    const seat = this.seatAt(e.sx, e.sy);
    const s = this.store.getState();
    if (seat) s.select([seat]);
    else s.clearSelection();
  }

  wheel(sx: number, sy: number, deltaY: number): void {
    this.view.wheel(sx, sy, deltaY);
  }

  /** The seat under a screen point: a seat itself, or the seat something is attached to. */
  seatAt(sx: number, sy: number): string | null {
    const s = this.store.getState();
    if (!s.plan || !s.hitIndex) return null;
    const hit = hitTest(s.plan, s.hitIndex, this.view.toPlan(sx, sy), 2 * s.viewport.mmPerPx);
    if (hit?.kind !== "object") return null;
    if (isSeat(s.plan, hit.id)) return hit.id;
    const parent = s.plan.objects[hit.id]?.attached_to;
    return parent && isSeat(s.plan, parent) ? parent : null;
  }
}
