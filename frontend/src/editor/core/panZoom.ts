/**
 * Panning and zooming, shared by the viewer's and the editor's input handling (docs/0042,
 * docs/0052): the canvas size, dragging the view, wheel zoom around the pointer, and telling a
 * click from a drag. Each interaction class keeps only what's its own (picking seats, tools).
 */
import type { Vec2 } from "./plan";
import type { EditorStore } from "./store";
import { panBy, screenToPlan, zoomAt } from "./viewport";

/** A press that moves less than this (screen px) before release is a click, not a drag. */
export const CLICK_SLOP_PX = 3;

/** How fast the wheel zooms: the view scales by e^(-deltaY × this). */
const WHEEL_ZOOM_RATE = 0.0015;

export function isClick(down: Vec2, sx: number, sy: number): boolean {
  return Math.hypot(sx - down[0], sy - down[1]) < CLICK_SLOP_PX;
}

export class PanZoom {
  size: Vec2 = [1, 1];
  private last: Vec2 | null = null;

  constructor(private readonly store: EditorStore) {}

  setSize(width: number, height: number): void {
    this.size = [Math.max(1, width), Math.max(1, height)];
  }

  /** A screen point (canvas px) in plan millimetres. */
  toPlan(sx: number, sy: number): Vec2 {
    return screenToPlan(this.store.getState().viewport, this.size, sx, sy);
  }

  startPan(sx: number, sy: number): void {
    this.last = [sx, sy];
  }

  /** Moves the view with the pointer while a pan is on. */
  movePan(sx: number, sy: number): void {
    if (!this.last) return;
    const s = this.store.getState();
    s.setViewport(panBy(s.viewport, sx - this.last[0], sy - this.last[1]));
    this.last = [sx, sy];
  }

  endPan(): void {
    this.last = null;
  }

  wheel(sx: number, sy: number, deltaY: number): void {
    const s = this.store.getState();
    s.setViewport(zoomAt(s.viewport, this.size, sx, sy, Math.exp(-deltaY * WHEEL_ZOOM_RATE)));
  }
}
