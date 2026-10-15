/**
 * Renderer-agnostic pointer and keyboard interaction (docs/0052). Views translate raw input
 * into these calls (screen pixels relative to the canvas, plus button and modifiers); the core
 * decides what it means for the current tool and updates the store.
 *
 * Select tool: click selects an object or a wall (Shift adds), dragging objects moves them,
 * dragging a selected wall's end moves the junction with every wall that meets there (Alt
 * detaches just that wall, docs/0044), and empty space pans. Wall tool: see WallTool. The
 * middle button always pans; the wheel zooms.
 */
import { deleteSelection, moveJunction, wallsAt } from "./edits";
import { hitTest } from "./hitTest";
import type { Vec2 } from "./plan";
import { SNAP_PX, snapPoint } from "./snap";
import type { EditorStore } from "./store";
import { WallTool } from "./tools/wallTool";
import { panBy, screenToPlan, zoomAt } from "./viewport";

export interface PointerInput {
  sx: number;
  sy: number;
  /** 0 = primary, 1 = middle, 2 = secondary (DOM convention). */
  button: number;
  shift: boolean;
  alt?: boolean;
}

type Gesture =
  | { kind: "none" }
  /** `clickClears`: a click without moving (on empty space) clears the selection. */
  | { kind: "pan"; lastSx: number; lastSy: number; clickClears?: boolean }
  | { kind: "drag"; start: Vec2; moved: boolean }
  | { kind: "junction"; from: Vec2; walls: string[] };

const DRAG_THRESHOLD_PX = 3;

export class Interaction {
  private gesture: Gesture = { kind: "none" };
  private size: Vec2 = [1, 1];
  private downAt: Vec2 = [0, 0];
  private readonly wallTool: WallTool;

  constructor(private readonly store: EditorStore) {
    this.wallTool = new WallTool(store);
  }

  setSize(width: number, height: number): void {
    this.size = [Math.max(1, width), Math.max(1, height)];
  }

  private toPlan(e: PointerInput): Vec2 {
    return screenToPlan(this.store.getState().viewport, this.size, e.sx, e.sy);
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
    if (s.tool === "wall") {
      if (e.button === 2) this.wallTool.finish();
      // A click places a corner (on release); a drag pans.
      else if (e.button === 0) this.gesture = { kind: "pan", lastSx: e.sx, lastSy: e.sy };
      return "none";
    }
    if (e.button !== 0) return "none";
    const p = this.toPlan(e);
    const tolerance = 4 * s.viewport.mmPerPx; // ~4 px of slop at any zoom
    const end = this.selectedWallEnd(p);
    if (end) {
      const walls = e.alt ? [end.wall] : wallsAt(s.plan, end.point);
      this.gesture = { kind: "junction", from: end.point, walls };
      return "none";
    }
    const hit = hitTest(s.plan, s.hitIndex, p, tolerance);
    if (hit?.kind === "object") {
      if (e.shift || !s.selection.has(hit.id)) s.select([hit.id], e.shift);
      this.gesture = { kind: "drag", start: p, moved: false };
      return "select";
    }
    if (hit?.kind === "wall") {
      s.select([hit.id], e.shift);
      this.gesture = { kind: "pan", lastSx: e.sx, lastSy: e.sy };
      return "select";
    }
    // Empty space: pan, and clear selection on a plain click.
    this.gesture = { kind: "pan", lastSx: e.sx, lastSy: e.sy, clickClears: !e.shift };
    return "clear";
  }

  /** An end of a selected wall near the pointer, which can be dragged. */
  private selectedWallEnd(p: Vec2): { point: Vec2; wall: string } | null {
    const s = this.store.getState();
    const reach = SNAP_PX * s.viewport.mmPerPx;
    for (const w of s.plan?.walls ?? []) {
      if (!s.selection.has(w.id)) continue;
      for (const point of [w.a, w.b]) {
        if (Math.hypot(point[0] - p[0], point[1] - p[1]) <= reach) return { point, wall: w.id };
      }
    }
    return null;
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
      const p = this.toPlan(e);
      const snap = (v: number) =>
        s.gridSnap ? Math.round(v / s.gridMm) * s.gridMm : Math.round(v);
      s.setDrag({ dx: snap(p[0] - g.start[0]), dy: snap(p[1] - g.start[1]) });
    } else if (g.kind === "junction" && s.plan) {
      const { point, kind } = snapPoint(s.plan, this.toPlan(e), {
        mmPerPx: s.viewport.mmPerPx,
        gridMm: s.gridMm,
        gridSnap: s.gridSnap,
        ignore: g.from,
      });
      s.setPreview({ kind: "junction", from: g.from, to: point, walls: g.walls, snap: kind });
    } else if (s.tool === "wall") {
      this.wallTool.hover(this.toPlan(e));
    }
  }

  pointerUp(e: PointerInput): void {
    const s = this.store.getState();
    const g = this.gesture;
    this.gesture = { kind: "none" };
    const clicked = Math.hypot(e.sx - this.downAt[0], e.sy - this.downAt[1]) < DRAG_THRESHOLD_PX;
    if (g.kind === "drag" && g.moved) {
      s.commitDrag();
    } else if (g.kind === "junction") {
      const preview = s.preview;
      s.setPreview(null);
      if (preview?.kind === "junction" && s.plan) {
        s.perform(moveJunction(s.plan, g.walls, g.from, preview.to));
      }
    } else if (g.kind === "pan" && clicked && e.button === 0) {
      if (s.tool === "wall") this.wallTool.click(this.toPlan(e));
      else if (g.clickClears) s.clearSelection();
    }
  }

  wheel(sx: number, sy: number, deltaY: number): void {
    const s = this.store.getState();
    s.setViewport(zoomAt(s.viewport, this.size, sx, sy, Math.exp(-deltaY * 0.0015)));
  }

  /** Keyboard commands; returns whether the key was used. */
  key(key: string): boolean {
    const s = this.store.getState();
    switch (key) {
      case "Escape":
        if (s.tool === "wall" && this.wallTool.finish()) return true;
        if (s.tool !== "select") s.setTool("select");
        else s.clearSelection();
        return true;
      case "Enter":
        return s.tool === "wall" && this.wallTool.finish();
      case "Delete":
      case "Backspace":
        if (!s.plan || !s.selection.size) return false;
        s.perform(deleteSelection(s.plan, s.selection));
        return true;
      default:
        return false;
    }
  }
}
