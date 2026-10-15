/**
 * Renderer-agnostic pointer and keyboard interaction (docs/0052). Views translate raw input
 * into these calls (screen pixels relative to the canvas, plus button and modifiers); the core
 * decides what it means for the current tool and updates the store.
 *
 * Select tool: click selects (Shift adds); dragging furniture or columns moves them, dragging a
 * door or window slides it along its wall, dragging a selected wall's end moves the junction
 * with every wall that meets there (Alt detaches just that wall, docs/0044), dragging a
 * selected zone's corner reshapes it, a click inside a zone selects it, and empty space pans.
 * Drawing tools (wall, door, window, column, zone): a click places, a drag pans; see their
 * classes. The middle button always pans; the wheel zooms.
 */
import { deleteSelection, moveJunction, moveZoneVertex, type OpeningType, wallsAt } from "./edits";
import { alongSegment } from "./geometry";
import { hitTest, zoneAt } from "./hitTest";
import type { Vec2 } from "./plan";
import { SNAP_PX, snapPoint } from "./snap";
import type { EditorStore } from "./store";
import { ColumnTool } from "./tools/columnTool";
import { fitOnWall, OpeningTool } from "./tools/openingTool";
import { WallTool } from "./tools/wallTool";
import { ZoneTool } from "./tools/zoneTool";
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
  | { kind: "junction"; from: Vec2; walls: string[] }
  /** Sliding a door or window: `grab` is where along it the pointer took hold. */
  | { kind: "slide"; id: string; grab: number }
  | { kind: "vertex"; zone: string; index: number; from: Vec2 };

const DRAG_THRESHOLD_PX = 3;

export class Interaction {
  private gesture: Gesture = { kind: "none" };
  private size: Vec2 = [1, 1];
  private downAt: Vec2 = [0, 0];
  private readonly wallTool: WallTool;
  private readonly openingTool: OpeningTool;
  private readonly columnTool: ColumnTool;
  private readonly zoneTool: ZoneTool;

  constructor(private readonly store: EditorStore) {
    this.wallTool = new WallTool(store);
    this.openingTool = new OpeningTool(store);
    this.columnTool = new ColumnTool(store);
    this.zoneTool = new ZoneTool(store);
  }

  /** The pointer moved with no button down, or a click placed something (drawing tools). */
  private toolAt(p: Vec2, click: boolean): void {
    const tool = this.store.getState().tool;
    if (tool === "wall") return click ? this.wallTool.click(p) : this.wallTool.hover(p);
    if (tool === "door" || tool === "window") {
      const type: OpeningType = tool;
      return click ? this.openingTool.click(p, type) : this.openingTool.hover(p, type);
    }
    if (tool === "column") return click ? this.columnTool.click(p) : this.columnTool.hover(p);
    if (tool === "zone") return click ? this.zoneTool.click(p) : this.zoneTool.hover(p);
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
    if (s.tool !== "select") {
      if (e.button === 2 && s.tool === "wall") this.wallTool.finish();
      // A click places (on release); a drag pans.
      else if (e.button === 0) this.gesture = { kind: "pan", lastSx: e.sx, lastSy: e.sy };
      return "none";
    }
    if (e.button !== 0) return "none";
    const p = this.toPlan(e);
    const tolerance = 4 * s.viewport.mmPerPx; // ~4 px of slop at any zoom
    const corner = this.selectedZoneCorner(p);
    if (corner) {
      this.gesture = { kind: "vertex", ...corner };
      return "none";
    }
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
    if (hit?.kind === "column") {
      if (e.shift || !s.selection.has(hit.id)) s.select([hit.id], e.shift);
      this.gesture = { kind: "drag", start: p, moved: false };
      return "select";
    }
    if (hit?.kind === "opening") {
      s.select([hit.id], e.shift);
      const o = s.plan.openings.find((x) => x.id === hit.id);
      const w = o && s.plan.walls.find((x) => x.id === o.wall_id);
      if (o && w) {
        const grab = alongSegment(p, w.a, w.b).along - o.offset_mm;
        this.gesture = { kind: "slide", id: o.id, grab };
      }
      return "select";
    }
    if (hit?.kind === "wall") {
      s.select([hit.id], e.shift);
      this.gesture = { kind: "pan", lastSx: e.sx, lastSy: e.sy };
      return "select";
    }
    const zone = zoneAt(s.plan, p);
    if (zone) {
      s.select([zone], e.shift);
      this.gesture = { kind: "pan", lastSx: e.sx, lastSy: e.sy };
      return "select";
    }
    // Empty space: pan, and clear selection on a plain click.
    this.gesture = { kind: "pan", lastSx: e.sx, lastSy: e.sy, clickClears: !e.shift };
    return "clear";
  }

  /** A corner of a selected zone near the pointer, which can be dragged. */
  private selectedZoneCorner(p: Vec2): { zone: string; index: number; from: Vec2 } | null {
    const s = this.store.getState();
    const reach = SNAP_PX * s.viewport.mmPerPx;
    for (const z of s.plan?.zones ?? []) {
      if (!s.selection.has(z.id)) continue;
      const index = z.boundary.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= reach);
      if (index >= 0) return { zone: z.id, index, from: z.boundary[index]! };
    }
    return null;
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
    } else if (g.kind === "vertex" && s.plan) {
      const { point, kind } = snapPoint(s.plan, this.toPlan(e), {
        mmPerPx: s.viewport.mmPerPx,
        gridMm: s.gridMm,
        gridSnap: s.gridSnap,
        ignore: g.from,
      });
      s.setPreview({ kind: "vertex", zone: g.zone, index: g.index, to: point, snap: kind });
    } else if (g.kind === "slide" && s.plan) {
      const o = s.plan.openings.find((x) => x.id === g.id);
      const w = o && s.plan.walls.find((x) => x.id === o.wall_id);
      if (!o || !w) return;
      const along = alongSegment(this.toPlan(e), w.a, w.b).along - g.grab + o.width_mm / 2;
      s.setPreview({
        kind: "opening",
        id: o.id,
        type: o.type,
        wall_id: w.id,
        offset_mm: fitOnWall(w, along, o.width_mm) ?? o.offset_mm,
        width_mm: o.width_mm,
      });
    } else if (g.kind === "none" && s.tool !== "select") {
      this.toolAt(this.toPlan(e), false);
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
    } else if (g.kind === "vertex") {
      const preview = s.preview;
      s.setPreview(null);
      if (preview?.kind === "vertex" && s.plan) {
        s.perform(moveZoneVertex(s.plan, g.zone, g.index, preview.to));
      }
    } else if (g.kind === "slide") {
      const preview = s.preview;
      s.setPreview(null);
      const o = s.plan?.openings.find((x) => x.id === g.id);
      if (preview?.kind === "opening" && o && preview.offset_mm !== o.offset_mm) {
        s.perform([
          { op: "update", kind: "opening", id: o.id, data: { offset_mm: preview.offset_mm } },
        ]);
      }
    } else if (g.kind === "pan" && clicked && e.button === 0) {
      if (s.tool !== "select") this.toolAt(this.toPlan(e), true);
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
        if (s.tool === "zone" && this.zoneTool.cancel()) return true;
        if (s.tool !== "select") s.setTool("select");
        else s.clearSelection();
        return true;
      case "Enter":
        if (s.tool === "zone") return this.zoneTool.close();
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
