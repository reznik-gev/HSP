/**
 * Read-only plan interaction (docs/0087): dragging always pans, a click selects the seat under
 * the pointer (or clears the selection), and hovering reports which seat is under the pointer.
 * Nothing can be moved. Renderer-agnostic like `Interaction` (docs/0052).
 */
import { isSeat } from "./fromApi";
import { hitTest } from "./hitTest";
import type { PointerInput } from "./interaction";
import type { Vec2 } from "./plan";
import type { EditorStore } from "./store";
import { panBy, screenToPlan, zoomAt } from "./viewport";

const CLICK_SLOP_PX = 3;

export class ViewerInteraction {
  private size: Vec2 = [1, 1];
  private down: { sx: number; sy: number; lastSx: number; lastSy: number } | null = null;

  constructor(private readonly store: EditorStore) {}

  setSize(width: number, height: number): void {
    this.size = [Math.max(1, width), Math.max(1, height)];
  }

  pointerDown(e: PointerInput): "pan" | "none" {
    if (e.button !== 0 && e.button !== 1) return "none";
    this.down = { sx: e.sx, sy: e.sy, lastSx: e.sx, lastSy: e.sy };
    return "pan";
  }

  pointerMove(e: PointerInput): void {
    const d = this.down;
    if (!d) return;
    const s = this.store.getState();
    s.setViewport(panBy(s.viewport, e.sx - d.lastSx, e.sy - d.lastSy));
    d.lastSx = e.sx;
    d.lastSy = e.sy;
  }

  pointerUp(e: PointerInput): void {
    const d = this.down;
    this.down = null;
    if (!d || e.button !== 0) return;
    if (Math.hypot(e.sx - d.sx, e.sy - d.sy) >= CLICK_SLOP_PX) return; // that was a pan
    const seat = this.seatAt(e.sx, e.sy);
    const s = this.store.getState();
    if (seat) s.select([seat]);
    else s.clearSelection();
  }

  wheel(sx: number, sy: number, deltaY: number): void {
    const s = this.store.getState();
    s.setViewport(zoomAt(s.viewport, this.size, sx, sy, Math.exp(-deltaY * 0.0015)));
  }

  /** The seat under a screen point: a seat itself, or the seat something is attached to. */
  seatAt(sx: number, sy: number): string | null {
    const s = this.store.getState();
    if (!s.plan || !s.hitIndex) return null;
    const p = screenToPlan(s.viewport, this.size, sx, sy);
    const hit = hitTest(s.plan, s.hitIndex, p, 2 * s.viewport.mmPerPx);
    if (hit?.kind !== "object") return null;
    if (isSeat(s.plan, hit.id)) return hit.id;
    const parent = s.plan.objects[hit.id]?.attached_to;
    return parent && isSeat(s.plan, parent) ? parent : null;
  }
}
