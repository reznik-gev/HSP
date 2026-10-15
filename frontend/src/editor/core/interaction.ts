/**
 * Renderer-agnostic pointer and keyboard interaction (docs/0052). Views translate raw input
 * into these calls (screen pixels relative to the canvas, plus button and modifiers); the core
 * decides what it means for the current tool and updates the store.
 *
 * Select tool: click selects (Shift adds); dragging furniture or columns moves them, dragging a
 * door or window slides it along its wall, dragging a selected wall's end moves the junction
 * with every wall that meets there (Alt detaches just that wall, docs/0044), dragging a
 * selected zone's corner reshapes it, a click inside a zone selects it, and empty space pans.
 * Drawing tools (wall, door, window, column, zone, item): a click places, a drag pans; see
 * their classes. R turns the item being placed, or the selected furniture, a quarter turn.
 * The middle button always pans and the wheel zooms (PanZoom, shared with the viewer).
 */
import {
  deleteSelection,
  moveJunction,
  moveZoneVertex,
  type OpeningType,
  rotateObjects,
  wallsAt,
} from "./edits";
import { alongSegment } from "./geometry";
import { viewportFor } from "./focus";
import { type ItemShape, placeItem } from "./furnitureSnap";
import type { Measure } from "./measure";
import { hitTest, zoneAt } from "./hitTest";
import type { Vec2 } from "./plan";
import { SNAP_PX, snapPoint, snapSettings } from "./snap";
import type { EditorStore } from "./store";
import { ColumnTool } from "./tools/columnTool";
import { ItemTool } from "./tools/itemTool";
import { NumberTool } from "./tools/numberTool";
import { fitOnWall, OpeningTool } from "./tools/openingTool";
import { WallTool } from "./tools/wallTool";
import { ZoneTool } from "./tools/zoneTool";
import { isClick, PanZoom } from "./panZoom";
import { planToScreen } from "./viewport";

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
  | { kind: "pan"; clickClears?: boolean }
  | { kind: "drag"; start: Vec2; moved: boolean }
  | { kind: "junction"; from: Vec2; walls: string[] }
  /** Sliding a door or window: `grab` is where along it the pointer took hold. */
  | { kind: "slide"; id: string; grab: number }
  | { kind: "vertex"; zone: string; index: number; from: Vec2 }
  /** Numbering seats by clicking or dragging across them. */
  | { kind: "numbering" };

export class Interaction {
  private gesture: Gesture = { kind: "none" };
  private readonly view: PanZoom;
  private downAt: Vec2 = [0, 0];
  private readonly wallTool: WallTool;
  private readonly openingTool: OpeningTool;
  private readonly columnTool: ColumnTool;
  private readonly zoneTool: ZoneTool;
  private readonly itemTool: ItemTool;
  private readonly numberTool: NumberTool;

  constructor(private readonly store: EditorStore) {
    this.view = new PanZoom(store);
    this.wallTool = new WallTool(store);
    this.openingTool = new OpeningTool(store);
    this.columnTool = new ColumnTool(store);
    this.zoneTool = new ZoneTool(store);
    this.itemTool = new ItemTool(store);
    this.numberTool = new NumberTool(store);
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
    if (tool === "item") return click ? this.itemTool.click(p) : this.itemTool.hover(p);
  }

  setSize(width: number, height: number): void {
    this.view.setSize(width, height);
  }

  /** Starts dragging the view; a click without moving may do more on release. */
  private pan(e: PointerInput, clickClears = false): void {
    this.view.startPan(e.sx, e.sy);
    this.gesture = { kind: "pan", clickClears };
  }

  private toPlan(e: PointerInput): Vec2 {
    return this.view.toPlan(e.sx, e.sy);
  }

  /** Returns what happened, so the view can e.g. time selection latency. */
  pointerDown(e: PointerInput): "select" | "pan" | "clear" | "none" {
    this.store.getState().setSnapFree(Boolean(e.alt));
    const s = this.store.getState();
    if (!s.plan || !s.hitIndex) return "none";
    this.downAt = [e.sx, e.sy];
    if (e.button === 1) {
      this.pan(e);
      return "pan";
    }
    if (s.tool === "number") {
      if (e.button !== 0) return "none";
      this.gesture = { kind: "numbering" };
      this.numberTool.begin(this.toPlan(e));
      return "none";
    }
    if (s.tool !== "select") {
      if (e.button === 2 && s.tool === "wall") this.wallTool.finish();
      // A click places (on release); a drag pans.
      else if (e.button === 0) this.pan(e);
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
      this.pan(e);
      return "select";
    }
    const zone = zoneAt(s.plan, p);
    if (zone) {
      s.select([zone], e.shift);
      this.pan(e);
      return "select";
    }
    // Empty space: pan, and clear selection on a plain click.
    this.pan(e, !e.shift);
    return "clear";
  }

  /**
   * The one item being dragged, if the selection is a single item (with whatever is attached
   * to it), with its size and what it can sit on.
   */
  private singleItem() {
    const s = this.store.getState();
    if (!s.plan) return null;
    const own = [...s.selection].filter((id) => {
      const o = s.plan!.objects[id];
      return o && !(o.attached_to && s.selection.has(o.attached_to));
    });
    const object = own.length === 1 ? s.plan.objects[own[0]!] : undefined;
    if (!object || [...s.selection].some((id) => !s.plan!.objects[id])) return null;
    const item =
      s.document?.catalog[object.catalog_item_rev_id] ?? s.plan.catalog[object.catalog_item_rev_id];
    if (!item) return null;
    const shape: ItemShape = item;
    return { object, shape, moving: new Set(s.selection) };
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
    this.lastPointer = { sx: e.sx, sy: e.sy };
    this.store.getState().setSnapFree(Boolean(e.alt));
    const s = this.store.getState();
    const g = this.gesture;
    if (g.kind === "pan") {
      this.view.movePan(e.sx, e.sy);
    } else if (g.kind === "drag") {
      if (!g.moved && isClick(this.downAt, e.sx, e.sy)) return;
      g.moved = true;
      const p = this.toPlan(e);
      const single = this.singleItem();
      if (single && s.plan) {
        // One item: it snaps against walls and onto hosts like a newly placed one.
        const o = single.object;
        const from: Vec2 = [o.position[0], o.position[1]];
        const want: Vec2 = [from[0] + p[0] - g.start[0], from[1] + p[1] - g.start[1]];
        const placed = placeItem(s.plan, single.shape, want, o.rotation_ddeg, {
          ...snapSettings(s, e.alt),
          ignoreIds: single.moving,
        });
        const turn = placed.rotation_ddeg - o.rotation_ddeg;
        s.setDrag({
          dx: placed.at[0] - from[0],
          dy: placed.at[1] - from[1],
          turn: turn ? { ddeg: turn, pivot: from } : undefined,
          attachTo: single.shape.attaches_to_categories?.length
            ? { id: o.id, host: placed.attachedTo }
            : undefined,
        });
        return;
      }
      const snap = (v: number) =>
        s.gridSnap && !e.alt ? Math.round(v / s.gridMm) * s.gridMm : Math.round(v);
      s.setDrag({ dx: snap(p[0] - g.start[0]), dy: snap(p[1] - g.start[1]) });
    } else if (g.kind === "junction" && s.plan) {
      const { point, kind } = snapPoint(s.plan, this.toPlan(e), {
        ...snapSettings(s, e.alt),
        ignore: g.from,
        // The moving walls' own centrelines move with them.
        ignoreWalls: new Set(g.walls),
      });
      s.setPreview({ kind: "junction", from: g.from, to: point, walls: g.walls, snap: kind });
    } else if (g.kind === "numbering") {
      this.numberTool.extend(this.toPlan(e));
    } else if (g.kind === "vertex" && s.plan) {
      const { point, kind } = snapPoint(s.plan, this.toPlan(e), {
        ...snapSettings(s, e.alt),
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
    this.store.getState().setSnapFree(Boolean(e.alt));
    const s = this.store.getState();
    const g = this.gesture;
    this.gesture = { kind: "none" };
    this.view.endPan();
    const clicked = isClick(this.downAt, e.sx, e.sy);
    if (g.kind === "drag" && g.moved) {
      s.commitDrag();
    } else if (g.kind === "junction") {
      const preview = s.preview;
      s.setPreview(null);
      if (preview?.kind === "junction" && s.plan) {
        s.perform(moveJunction(s.plan, g.walls, g.from, preview.to));
      }
    } else if (g.kind === "numbering") {
      this.numberTool.end();
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

  /** Selects an element and brings it into view (clicking a problem, docs/0090). */
  focus(id: string): void {
    const s = this.store.getState();
    if (!s.plan) return;
    const viewport = viewportFor(s.plan, id, this.view.size);
    if (!viewport) return;
    s.select([id]);
    s.setViewport(viewport);
  }

  wheel(sx: number, sy: number, deltaY: number): void {
    this.view.wheel(sx, sy, deltaY);
  }

  /** A plan point on the canvas, in screen pixels (for labels drawn over the plan). */
  screenOf(p: Vec2): [number, number] {
    const [sx, sy] = planToScreen(this.store.getState().viewport, this.view.size, p);
    return [sx, sy];
  }

  /** A canvas point (screen px) on the plan, in mm. */
  planAt(sx: number, sy: number): Vec2 {
    return this.view.toPlan(sx, sy);
  }

  /** Where the pointer last was on the canvas (screen px), e.g. to open a box there. */
  lastPointer: { sx: number; sy: number } = { sx: 0, sy: 0 };

  /**
   * What a typed measurement would do now (docs/0045): place the next wall corner, move what
   * is being dragged, or nothing.
   */
  measureTarget(): "wall" | "move" | null {
    const s = this.store.getState();
    if (this.gesture.kind === "drag" && this.gesture.moved && s.drag) return "move";
    if (s.tool === "wall" && this.wallTool.drawing()) return "wall";
    return null;
  }

  /** Applies a typed measurement; returns false when there's nothing to apply it to. */
  applyMeasure(m: Measure): boolean {
    const s = this.store.getState();
    const target = this.measureTarget();
    if (target === "wall") return this.wallTool.placeTyped(m);
    if (target === "move" && s.drag) {
      // Exactly that far along the drag (docs/0045).
      const len = Math.hypot(s.drag.dx, s.drag.dy);
      if (!len) return false;
      s.setDrag({
        dx: Math.round((s.drag.dx / len) * m.lengthMm),
        dy: Math.round((s.drag.dy / len) * m.lengthMm),
      });
      s.commitDrag();
      this.gesture = { kind: "none" };
      return true;
    }
    return false;
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
      case "g":
      case "G":
        s.toggleGridSnap();
        return true;
      case "Enter":
        if (s.tool === "zone") return this.zoneTool.close();
        return s.tool === "wall" && this.wallTool.finish();
      case "r":
      case "R": {
        if (s.tool === "item") {
          s.rotatePlacing();
          const preview = s.preview;
          if (preview?.kind === "item") {
            s.setPreview({ ...preview, rotation_ddeg: this.store.getState().placingRotation });
          }
          return true;
        }
        if (s.tool !== "select" || !s.plan) return false;
        const ops = rotateObjects(s.plan, s.selection);
        if (!ops.length) return false;
        s.perform(ops);
        return true;
      }
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
