/**
 * Renderer-agnostic pointer interaction (docs/0052). Views translate raw input into these calls
 * (screen pixels relative to the canvas, plus button and modifiers); the core decides whether
 * that means select, drag or pan, and updates the store.
 */
import { hitTest } from "./hitTest";
import type { Vec2 } from "./plan";
import type { EditorStore } from "./store";
import { panBy, screenToPlan, zoomAt } from "./viewport";

export interface PointerInput {
  sx: number;
  sy: number;
  /** 0 = primary, 1 = middle, 2 = secondary (DOM convention). */
  button: number;
  shift: boolean;
}

type Gesture =
  | { kind: "none" }
  | { kind: "pan"; lastSx: number; lastSy: number }
  | { kind: "drag"; start: Vec2; moved: boolean };

const DRAG_THRESHOLD_PX = 3;

export class Interaction {
  private gesture: Gesture = { kind: "none" };
  private size: Vec2 = [1, 1];
  private downAt: Vec2 = [0, 0];

  constructor(private readonly store: EditorStore) {}

  setSize(width: number, height: number): void {
    this.size = [Math.max(1, width), Math.max(1, height)];
  }

  /** Returns what happened, so the view can e.g. time selection latency. */
  pointerDown(e: PointerInput): "select" | "pan" | "clear" | "none" {
    const s = this.store.getState();
    if (!s.plan || !s.hitIndex) return "none";
    this.downAt = [e.sx, e.sy];
    if (e.button === 1) {
      this.gesture = { kind: "pan", lastSx: e.sx, lastSy: e.sy };
      return "pan";
    }
    if (e.button !== 0) return "none";
    const p = screenToPlan(s.viewport, this.size, e.sx, e.sy);
    const tolerance = 4 * s.viewport.mmPerPx; // ~4 px of slop at any zoom
    const hit = hitTest(s.plan, s.hitIndex, p, tolerance);
    if (hit?.kind === "object") {
      if (e.shift || !s.selection.has(hit.id)) s.select([hit.id], e.shift);
      this.gesture = { kind: "drag", start: p, moved: false };
      return "select";
    }
    // Empty space (or a wall, not draggable yet): pan, and clear selection on a plain click.
    this.gesture = { kind: "pan", lastSx: e.sx, lastSy: e.sy };
    return "clear";
  }

  pointerMove(e: PointerInput): void {
    const s = this.store.getState();
    const g = this.gesture;
    if (g.kind === "pan") {
      s.setViewport(panBy(s.viewport, e.sx - g.lastSx, e.sy - g.lastSy));
      this.gesture = { ...g, lastSx: e.sx, lastSy: e.sy };
    } else if (g.kind === "drag") {
      if (
        !g.moved &&
        Math.hypot(e.sx - this.downAt[0], e.sy - this.downAt[1]) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      g.moved = true;
      const p = screenToPlan(s.viewport, this.size, e.sx, e.sy);
      const snap = (v: number) =>
        s.gridSnap ? Math.round(v / s.gridMm) * s.gridMm : Math.round(v);
      s.setDrag({ dx: snap(p[0] - g.start[0]), dy: snap(p[1] - g.start[1]) });
    }
  }

  pointerUp(e: PointerInput): void {
    const s = this.store.getState();
    const g = this.gesture;
    this.gesture = { kind: "none" };
    if (g.kind === "drag" && g.moved) {
      s.commitDrag();
    } else if (g.kind === "pan") {
      const clicked = Math.hypot(e.sx - this.downAt[0], e.sy - this.downAt[1]) < DRAG_THRESHOLD_PX;
      if (clicked && e.button === 0 && !e.shift) s.clearSelection();
    }
  }

  wheel(sx: number, sy: number, deltaY: number): void {
    const s = this.store.getState();
    s.setViewport(zoomAt(s.viewport, this.size, sx, sy, Math.exp(-deltaY * 0.0015)));
  }
}
