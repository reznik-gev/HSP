/**
 * Renderer-agnostic pointer and keyboard interaction (docs/0052). Views translate raw input
 * into these calls (screen pixels relative to the canvas, plus button and modifiers); the core
 * decides what it means for the current tool and updates the store.
 *
 * Select tool: click selects (Shift adds); Shift+drag selects what's inside a rectangle
 * (docs/0133). Dragging one element of a selection with walls, zones, doors or windows moves
 * it all, as the arrow keys do (docs/0133). Otherwise dragging furniture or columns moves them,
 * dragging a door or window slides it along its wall, dragging a selected wall's end moves the
 * junction with every wall that meets there (Alt detaches just that wall, docs/0044), and
 * dragging a selected wall's body moves the whole wall and the walls joined to it stretch (Alt
 * detaches it, docs/0108). Alt pressed at any point in a wall or group drag detaches, and it
 * stays detached until the drag ends, while snapping follows Alt as it's held (docs/0130).
 * Dragging a selected zone's corner reshapes it, a click inside a zone selects it, and empty
 * space pans.
 * Drawing tools (wall, door, window, column, zone, item): a click places, a drag pans; see
 * their classes. R turns the item being placed, or the selected furniture, a quarter turn;
 * furniture being dragged turns where it has been dragged to, and the drag carries on (docs/0135).
 * The middle button always pans and the wheel zooms (PanZoom, shared with the viewer).
 */
import {
  deleteSelection,
  moveJunction,
  moveWall,
  nudgeOps,
  moveZoneVertex,
  movedBy,
  type OpeningType,
  rotateObjects,
  wallsAt,
} from "./edits";
import { alongSegment } from "./geometry";
import { viewportFor } from "./focus";
import { type ItemShape, placeItem } from "./furnitureSnap";
import type { Measure } from "./measure";
import { type Hit, hitTest, inBox, zoneAt } from "./hitTest";
import type { Plan, Vec2 } from "./plan";
import { SNAP_PX, snapPoint, snapSettings } from "./snap";
import type { EditorStore, Preview } from "./store";
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

/** Each arrow key's direction on the plan, where +y is up. */
const NUDGES: Record<string, Vec2> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/** The far ends of `walls` from their junction `at`: a dragged corner keeps straight from them
 *  (docs/0108). */
function farEnds(plan: Plan, walls: readonly string[], at: Vec2): Vec2[] {
  return plan.walls
    .filter((w) => walls.includes(w.id))
    .map((w) => (w.a[0] === at[0] && w.a[1] === at[1] ? w.b : w.a));
}

type Gesture =
  | { kind: "none" }
  /** `clickClears`: a click without moving (on empty space) clears the selection. */
  | { kind: "pan"; clickClears?: boolean }
  /** Moving the selection: `spin` is how far R turned it on the way, `last` the latest move. */
  | { kind: "drag"; start: Vec2; moved: boolean; spin: number; last?: PointerInput }
  /**
   * A selection with walls, zones, doors or windows, dragged by one of them (docs/0133).
   * `detach`: Alt was held at some point, so the walls joined to it don't stretch (docs/0130).
   */
  | { kind: "group"; start: Vec2; moved: boolean; detach: boolean }
  /** A junction dragged by the end of the selected wall `grabbed`; `walls` move with it. */
  | { kind: "junction"; from: Vec2; grabbed: string; walls: string[] }
  /** A selected wall dragged by its body; the walls joined at its ends stretch (docs/0108). */
  | {
      kind: "wall";
      id: string;
      start: Vec2;
      a: Vec2;
      b: Vec2;
      joinedA: string[];
      joinedB: string[];
    }
  /** Sliding a door or window: `grab` is where along it the pointer took hold. */
  | { kind: "slide"; id: string; grab: number }
  | { kind: "vertex"; zone: string; index: number; from: Vec2 }
  /** A Shift+press in Select: a drag draws a selection rectangle, a click adds (docs/0133). */
  | { kind: "box"; from: Vec2 }
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
    this.store.getState().setSnapStraight(e.shift);
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
    const corner = this.selectedZoneCorner(p);
    if (corner) {
      this.gesture = { kind: "vertex", ...corner };
      return "none";
    }
    const end = this.selectedWallEnd(p);
    if (end) {
      const walls = e.alt ? [end.wall] : wallsAt(s.plan, end.point);
      this.gesture = { kind: "junction", from: end.point, grabbed: end.wall, walls };
      return "none";
    }
    if (e.shift) {
      // Wherever it starts (docs/0133); the handles above keep their drag.
      this.gesture = { kind: "box", from: p };
      return "none";
    }
    const { hit, id: grabbed } = this.pick(p);
    if (grabbed && s.selection.size > 1 && s.selection.has(grabbed) && this.mixedSelection()) {
      // One of a group: they all move, as the arrow keys move them (docs/0133).
      this.gesture = { kind: "group", start: p, moved: false, detach: Boolean(e.alt) };
      return "select";
    }
    if (hit?.kind === "object") {
      if (!s.selection.has(hit.id)) s.select([hit.id]);
      this.gesture = { kind: "drag", start: p, moved: false, spin: 0 };
      return "select";
    }
    if (hit?.kind === "column") {
      if (!s.selection.has(hit.id)) s.select([hit.id]);
      this.gesture = { kind: "drag", start: p, moved: false, spin: 0 };
      return "select";
    }
    if (hit?.kind === "opening") {
      s.select([hit.id]);
      const o = s.plan.openings.find((x) => x.id === hit.id);
      const w = o && s.plan.walls.find((x) => x.id === o.wall_id);
      if (o && w) {
        const grab = alongSegment(p, w.a, w.b).along - o.offset_mm;
        this.gesture = { kind: "slide", id: o.id, grab };
      }
      return "select";
    }
    if (hit?.kind === "wall") {
      const w = s.plan.walls.find((x) => x.id === hit.id);
      if (w && s.selection.size === 1 && s.selection.has(w.id)) {
        // A selected wall: dragging its body moves it; Alt detaches it (docs/0108).
        const others = (p: Vec2) => (e.alt ? [] : wallsAt(s.plan!, p).filter((id) => id !== w.id));
        this.gesture = {
          kind: "wall",
          id: w.id,
          start: p,
          a: w.a,
          b: w.b,
          joinedA: others(w.a),
          joinedB: others(w.b),
        };
        return "none";
      }
      s.select([hit.id]);
      this.pan(e);
      return "select";
    }
    const zone = zoneAt(s.plan, p);
    if (zone) {
      s.select([zone]);
      this.pan(e);
      return "select";
    }
    // Empty space: pan, and clear the selection on a click.
    this.pan(e, true);
    return "clear";
  }

  /** A drag of several elements by `d`, in grid steps; whole millimetres with Alt or no grid. */
  private gridStep(d: Vec2, alt?: boolean): Vec2 {
    const s = this.store.getState();
    const snap = (v: number) =>
      s.gridSnap && !alt ? Math.round(v / s.gridMm) * s.gridMm : Math.round(v);
    return [snap(d[0]), snap(d[1])];
  }

  /** Whether the selection has more than items and columns, which `drag` moves on its own. */
  private mixedSelection(): boolean {
    const s = this.store.getState();
    const columns = new Set((s.plan?.columns ?? []).map((c) => c.id));
    return [...s.selection].some((id) => !s.plan?.objects[id] && !columns.has(id));
  }

  /** The group moved by `d`: the drag offset for items and columns, the preview for the rest. */
  private moveGroup(d: Vec2, detach: boolean): void {
    const s = this.store.getState();
    if (!s.plan) return;
    const ops = nudgeOps(s.plan, s.selection, d, detach);
    s.setDrag({ dx: d[0], dy: d[1] });
    s.setPreview({ kind: "group", ops, ...movedBy(s.plan, ops) });
  }

  /**
   * What's under the pointer in Select: what `hitTest` finds, with about 4 px of slop at any
   * zoom, and its id, or else the innermost zone's. A press and a Shift+click pick the same.
   */
  private pick(p: Vec2): { hit: Hit | null; id: string | null } {
    const s = this.store.getState();
    if (!s.plan || !s.hitIndex) return { hit: null, id: null };
    const hit = hitTest(s.plan, s.hitIndex, p, 4 * s.viewport.mmPerPx);
    return { hit, id: hit?.id ?? zoneAt(s.plan, p) };
  }

  /** Shift+click: adds the element under the pointer to the selection. */
  private addAt(p: Vec2): void {
    const { id } = this.pick(p);
    if (id) this.store.getState().select([id], true);
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

  /**
   * Where a dragged wall goes: moved with the pointer, then snapped by whichever end snaps to
   * something (a wall's end, midpoint or side) with the smaller correction, else by its first
   * end to the grid. The wall and the walls stretching with it aren't snapped to.
   */
  private wallMove(g: Extract<Gesture, { kind: "wall" }>, p: Vec2, alt?: boolean): Preview {
    const s = this.store.getState();
    const d: Vec2 = [p[0] - g.start[0], p[1] - g.start[1]];
    const opts = {
      ...snapSettings(s, alt),
      ignoreWalls: new Set([g.id, ...g.joinedA, ...g.joinedB]),
    };
    const want = (end: Vec2): Vec2 => [end[0] + d[0], end[1] + d[1]];
    const ends = [g.a, g.b].map((end) => ({ end, snapped: snapPoint(s.plan!, want(end), opts) }));
    const onSomething = ends.filter((x) => x.snapped.kind && x.snapped.kind !== "grid");
    const correction = (x: (typeof ends)[number]) =>
      Math.hypot(x.snapped.point[0] - want(x.end)[0], x.snapped.point[1] - want(x.end)[1]);
    const best = onSomething.sort((x, y) => correction(x) - correction(y))[0] ?? ends[0]!;
    return {
      kind: "wallMove",
      id: g.id,
      d: [best.snapped.point[0] - best.end[0], best.snapped.point[1] - best.end[1]],
      at: best.snapped.point,
      snap: best.snapped.kind,
      joinedA: g.joinedA,
      joinedB: g.joinedB,
    };
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

  /** Moves the selection being dragged to follow the pointer at `e`, turned by `g.spin`. */
  private dragTo(g: Extract<Gesture, { kind: "drag" }>, e: PointerInput): void {
    g.last = e;
    const s = this.store.getState();
    const p = this.toPlan(e);
    const spin = g.spin || undefined;
    const single = this.singleItem();
    if (single && s.plan) {
      // One item: it snaps against walls and onto hosts like a newly placed one.
      const o = single.object;
      const from: Vec2 = [o.position[0], o.position[1]];
      const want: Vec2 = [from[0] + p[0] - g.start[0], from[1] + p[1] - g.start[1]];
      const rotation = o.rotation_ddeg + g.spin;
      const placed = placeItem(s.plan, single.shape, want, rotation, {
        ...snapSettings(s, e.alt),
        ignoreIds: single.moving,
      });
      const turn = placed.rotation_ddeg - rotation;
      s.setDrag({
        dx: placed.at[0] - from[0],
        dy: placed.at[1] - from[1],
        spin,
        turn: turn ? { ddeg: turn, pivot: from } : undefined,
        attachTo: single.shape.attaches_to_categories?.length
          ? { id: o.id, host: placed.attachedTo }
          : undefined,
      });
      return;
    }
    const [dx, dy] = this.gridStep([p[0] - g.start[0], p[1] - g.start[1]], e.alt);
    s.setDrag({ dx, dy, spin });
  }

  pointerMove(e: PointerInput): void {
    this.lastPointer = { sx: e.sx, sy: e.sy };
    this.store.getState().setSnapFree(Boolean(e.alt));
    this.store.getState().setSnapStraight(e.shift);
    const s = this.store.getState();
    const g = this.gesture;
    if (g.kind === "pan") {
      this.view.movePan(e.sx, e.sy);
    } else if (g.kind === "drag") {
      if (!g.moved && isClick(this.downAt, e.sx, e.sy)) return;
      g.moved = true;
      this.dragTo(g, e);
    } else if (g.kind === "group") {
      if (e.alt) g.detach = true;
      if (!g.moved && isClick(this.downAt, e.sx, e.sy)) return;
      g.moved = true;
      // Grid steps, as several items move; Alt frees it while held (docs/0133).
      const p = this.toPlan(e);
      this.moveGroup(this.gridStep([p[0] - g.start[0], p[1] - g.start[1]], e.alt), g.detach);
    } else if (g.kind === "junction" && s.plan) {
      // Alt pressed mid-drag detaches too, and stays detached (docs/0130).
      if (e.alt) g.walls = [g.grabbed];
      const { point, kind } = snapPoint(s.plan, this.toPlan(e), {
        ...snapSettings(s, e.alt),
        ignore: g.from,
        // The moving walls' own centrelines move with them.
        ignoreWalls: new Set(g.walls),
        // Straight from the far end of any wall meeting here (docs/0108).
        anchors: farEnds(s.plan, g.walls, g.from),
        straight: e.shift,
      });
      s.setPreview({ kind: "junction", from: g.from, to: point, walls: g.walls, snap: kind });
    } else if (g.kind === "wall" && s.plan) {
      // Alt pressed mid-drag detaches too, and stays detached (docs/0130).
      if (e.alt) {
        g.joinedA = [];
        g.joinedB = [];
      }
      if (!s.preview && isClick(this.downAt, e.sx, e.sy)) return;
      s.setPreview(this.wallMove(g, this.toPlan(e), e.alt));
    } else if (g.kind === "box") {
      if (!s.preview && isClick(this.downAt, e.sx, e.sy)) return;
      s.setPreview({ kind: "box", from: g.from, to: this.toPlan(e) });
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
    this.store.getState().setSnapStraight(e.shift);
    const s = this.store.getState();
    const g = this.gesture;
    this.gesture = { kind: "none" };
    this.view.endPan();
    const clicked = isClick(this.downAt, e.sx, e.sy);
    if (g.kind === "drag" && g.moved) {
      s.commitDrag();
    } else if (g.kind === "group") {
      this.commitGroup();
    } else if (g.kind === "junction") {
      const preview = s.preview;
      s.setPreview(null);
      if (preview?.kind === "junction" && s.plan) {
        s.perform(moveJunction(s.plan, g.walls, g.from, preview.to));
      }
    } else if (g.kind === "wall") {
      const preview = s.preview;
      s.setPreview(null);
      if (preview?.kind === "wallMove" && s.plan) {
        s.perform(moveWall(s.plan, g.id, preview.d, g.joinedA, g.joinedB));
      }
    } else if (g.kind === "box") {
      s.setPreview(null);
      if (clicked) this.addAt(g.from);
      else if (s.plan) {
        // Adds what's fully inside to the selection (docs/0133).
        const caught = inBox(s.plan, g.from, this.toPlan(e), s.heightFilter);
        if (caught.length) s.select(caught, true);
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

  /** Saves the group's move, as one step to undo. */
  private commitGroup(): void {
    const s = this.store.getState();
    const preview = s.preview;
    s.setPreview(null);
    s.setDrag(null);
    if (preview?.kind === "group") s.perform([...preview.ops]);
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
    const g = this.gesture;
    if ((g.kind === "drag" || g.kind === "group") && g.moved && s.drag) return "move";
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
      const d: Vec2 = [
        Math.round((s.drag.dx / len) * m.lengthMm),
        Math.round((s.drag.dy / len) * m.lengthMm),
      ];
      if (this.gesture.kind === "group") {
        this.moveGroup(d, this.gesture.detach);
        this.commitGroup();
      } else {
        s.setDrag({ dx: d[0], dy: d[1], spin: s.drag.spin });
        s.commitDrag();
      }
      this.gesture = { kind: "none" };
      return true;
    }
    return false;
  }

  /** Keyboard commands; returns whether the key was used. */
  key(key: string, shift = false): boolean {
    const s = this.store.getState();
    switch (key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        // Nudge the selection 1 cm, 10 cm with Shift; up is up on the plan (docs/0108).
        if (s.tool !== "select" || !s.plan || !s.selection.size) return false;
        const step = shift ? 100 : 10;
        const [dx, dy] = NUDGES[key]!;
        const ops = nudgeOps(s.plan, s.selection, [dx * step, dy * step]);
        if (!ops.length) return false;
        s.performRun(ops, `nudge:${[...s.selection].sort().join(",")}`);
        return true;
      }
      case "Escape":
        if (this.gesture.kind === "box" || this.gesture.kind === "group") {
          // Drops the rectangle or the group's move; the selection stays as it was (docs/0133).
          this.gesture = { kind: "none" };
          s.setPreview(null);
          s.setDrag(null);
          return true;
        }
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
        const g = this.gesture;
        if (g.kind === "drag" && g.moved && g.last) {
          // Mid-drag: turn it where it's been dragged to, and keep dragging.
          g.spin = (g.spin + 900) % 3600;
          this.dragTo(g, g.last);
          return true;
        }
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
