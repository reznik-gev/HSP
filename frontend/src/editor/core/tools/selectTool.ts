/**
 * The Select tool's pointer gestures (docs/0052). Click selects (Shift adds); Shift+drag selects
 * what's inside a rectangle (docs/0133). Dragging one element of a selection with walls, zones,
 * doors or windows moves it all, as the arrow keys do (docs/0133, see groupDrag.ts). Otherwise
 * dragging furniture or columns moves them (one item snaps like a newly placed one), dragging a
 * door or window slides it along its wall, and dragging a selected wall's end or body moves the
 * junction or the whole wall (see moveWalls.ts). Dragging a selected zone's corner reshapes it.
 * R mid-drag turns the furniture where it has been dragged to, and the drag carries on
 * (docs/0135). A click inside a zone selects it and a drag from there pans, as does one from
 * empty space; Interaction does the panning.
 */
import { moveZoneVertex } from "../edits";
import { alongSegment } from "../geometry";
import { type ItemShape, placeItem } from "../furnitureSnap";
import { type Hit, hitTest, inBox, zoneAt } from "../hitTest";
import type { PointerInput } from "../interaction";
import type { Vec2 } from "../plan";
import type { PanZoom } from "../panZoom";
import { SNAP_PX, snapPoint, snapSettings } from "../snap";
import type { EditorStore } from "../store";
import { commitGroup, gridStep, type GroupDrag, mixedSelection, showGroup } from "./groupDrag";
import {
  dropWalls,
  type JunctionDrag,
  junctionDrag,
  junctionPreview,
  selectedWallEnd,
  type WallDrag,
  wallDrag,
  wallMove,
} from "./moveWalls";
import { fitOnWall } from "./openingTool";

type Gesture =
  | { kind: "none" }
  /** Moving the selection: `spin` is how far R turned it on the way, `last` the latest move. */
  | { kind: "drag"; start: Vec2; moved: boolean; spin: number; last?: PointerInput }
  | GroupDrag
  | JunctionDrag
  | WallDrag
  /** Sliding a door or window: `grab` is where along it the pointer took hold. */
  | { kind: "slide"; id: string; grab: number }
  | { kind: "vertex"; zone: string; index: number; from: Vec2 }
  /** A Shift+press: a drag draws a selection rectangle, a click adds (docs/0133). */
  | { kind: "box"; from: Vec2 };

/**
 * What a press did: `result` tells the view (e.g. to time selection latency); `pan` asks
 * Interaction to drag the view instead, and `clickClears` to clear the selection on a click.
 */
export type SelectPress =
  | { result: "select" | "none"; pan?: undefined }
  | { result: "select" | "clear"; pan: { clickClears: boolean } };

export class SelectTool {
  private gesture: Gesture = { kind: "none" };

  constructor(
    private readonly store: EditorStore,
    private readonly view: PanZoom,
  ) {}

  private toPlan(e: PointerInput): Vec2 {
    return this.view.toPlan(e.sx, e.sy);
  }

  /** A primary-button press, on a plan. */
  press(e: PointerInput): SelectPress {
    this.gesture = { kind: "none" };
    const s = this.store.getState();
    if (!s.plan) return { result: "none" };
    const p = this.toPlan(e);
    const corner = this.selectedZoneCorner(p);
    if (corner) {
      this.gesture = { kind: "vertex", ...corner };
      return { result: "none" };
    }
    const end = selectedWallEnd(s, p);
    if (end) {
      this.gesture = junctionDrag(s.plan, end, e.alt);
      return { result: "none" };
    }
    if (e.shift) {
      // Wherever it starts (docs/0133); the handles above keep their drag.
      this.gesture = { kind: "box", from: p };
      return { result: "none" };
    }
    const { hit, id: grabbed } = this.pick(p);
    if (grabbed && s.selection.size > 1 && s.selection.has(grabbed) && mixedSelection(this.store)) {
      // One of a group: they all move, as the arrow keys move them (docs/0133).
      this.gesture = {
        kind: "group",
        start: p,
        moved: false,
        detach: Boolean(e.alt),
        d: [0, 0],
        spin: 0,
      };
      return { result: "select" };
    }
    if (hit?.kind === "object" || hit?.kind === "column") {
      if (!s.selection.has(hit.id)) s.select([hit.id]);
      this.gesture = { kind: "drag", start: p, moved: false, spin: 0 };
      return { result: "select" };
    }
    if (hit?.kind === "opening") {
      s.select([hit.id]);
      const o = s.plan.openings.find((x) => x.id === hit.id);
      const w = o && s.plan.walls.find((x) => x.id === o.wall_id);
      if (o && w) {
        const grab = alongSegment(p, w.a, w.b).along - o.offset_mm;
        this.gesture = { kind: "slide", id: o.id, grab };
      }
      return { result: "select" };
    }
    if (hit?.kind === "wall") {
      const w = s.plan.walls.find((x) => x.id === hit.id);
      if (w && s.selection.size === 1 && s.selection.has(w.id)) {
        // A selected wall: dragging its body moves it; Alt detaches it (docs/0108).
        this.gesture = wallDrag(s.plan, w, p, e.alt);
        return { result: "none" };
      }
      s.select([hit.id]);
      return { result: "select", pan: { clickClears: false } };
    }
    const zone = zoneAt(s.plan, p);
    if (zone) {
      s.select([zone]);
      return { result: "select", pan: { clickClears: false } };
    }
    // Empty space: pan, and clear the selection on a click.
    return { result: "clear", pan: { clickClears: true } };
  }

  /** Whether a press started a gesture that hasn't ended, so pointer events come here. */
  active(): boolean {
    return this.gesture.kind !== "none";
  }

  /** Forgets the gesture, saving and clearing nothing: Interaction took the pointer. */
  drop(): void {
    this.gesture = { kind: "none" };
  }

  /** `still`: the pointer hasn't left the press's click distance yet. */
  move(e: PointerInput, still: boolean): void {
    const s = this.store.getState();
    const g = this.gesture;
    if (g.kind === "drag") {
      if (!g.moved && still) return;
      g.moved = true;
      this.dragTo(g, e);
    } else if (g.kind === "group") {
      if (e.alt) g.detach = true;
      if (!g.moved && still) return;
      g.moved = true;
      // Grid steps, as several items move; Alt frees it while held (docs/0133).
      const p = this.toPlan(e);
      g.d = gridStep(this.store, [p[0] - g.start[0], p[1] - g.start[1]], e.alt);
      showGroup(this.store, g);
    } else if (g.kind === "junction" && s.plan) {
      // Alt pressed mid-drag detaches too, and stays detached (docs/0130).
      if (e.alt) g.walls = [g.grabbed];
      s.setPreview(junctionPreview(s, s.plan, g, this.toPlan(e), e.alt, e.shift));
    } else if (g.kind === "wall" && s.plan) {
      // Alt pressed mid-drag detaches too, and stays detached (docs/0130).
      if (e.alt) {
        g.joinedA = [];
        g.joinedB = [];
      }
      if (!s.preview && still) return;
      s.setPreview(wallMove(s, s.plan, g, this.toPlan(e), e.alt));
    } else if (g.kind === "box") {
      if (!s.preview && still) return;
      s.setPreview({ kind: "box", from: g.from, to: this.toPlan(e) });
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
    }
  }

  /** Ends the gesture: saves what was dragged, or selects what was caught. `clicked`: the
   *  pointer never left the press's click distance. */
  release(e: PointerInput, clicked: boolean): void {
    const s = this.store.getState();
    const g = this.gesture;
    this.gesture = { kind: "none" };
    if (g.kind === "drag" && g.moved) {
      s.commitDrag();
    } else if (g.kind === "group") {
      commitGroup(this.store);
    } else if (g.kind === "junction" || g.kind === "wall") {
      dropWalls(s, g);
    } else if (g.kind === "box") {
      s.setPreview(null);
      if (clicked) this.addAt(g.from);
      else if (s.plan) {
        // Adds what's fully inside to the selection (docs/0133).
        const caught = inBox(s.plan, g.from, this.toPlan(e), s.heightFilter);
        if (caught.length) s.select(caught, true);
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
    }
  }

  /** Whether furniture, columns or a group are being dragged, so a typed distance moves them. */
  moving(): boolean {
    const g = this.gesture;
    return (g.kind === "drag" || g.kind === "group") && g.moved && !!this.store.getState().drag;
  }

  /** Saves the drag moved by exactly `d` instead (a typed distance, docs/0045), and ends it. */
  moveBy(d: Vec2): void {
    const s = this.store.getState();
    if (this.gesture.kind === "group") {
      this.gesture.d = d;
      showGroup(this.store, this.gesture);
      commitGroup(this.store);
    } else {
      s.setDrag({ dx: d[0], dy: d[1], spin: s.drag?.spin });
      s.commitDrag();
    }
    this.gesture = { kind: "none" };
  }

  /**
   * Escape: drops the rectangle or the group's move; the selection stays as it was
   * (docs/0133). Returns whether there was one.
   */
  cancel(): boolean {
    if (this.gesture.kind !== "box" && this.gesture.kind !== "group") return false;
    this.gesture = { kind: "none" };
    const s = this.store.getState();
    s.setPreview(null);
    s.setDrag(null);
    return true;
  }

  /** R mid-drag: turns what's being dragged where it is, and the drag carries on (docs/0135).
   *  Returns whether a drag took the turn. */
  spin(): boolean {
    const g = this.gesture;
    if (g.kind === "group" && g.moved) {
      // As for furniture alone: saved with the move.
      g.spin = (g.spin + 900) % 3600;
      showGroup(this.store, g);
      return true;
    }
    if (g.kind === "drag" && g.moved && g.last) {
      g.spin = (g.spin + 900) % 3600;
      this.dragTo(g, g.last);
      return true;
    }
    return false;
  }

  /**
   * What's under the pointer: what `hitTest` finds, with about 4 px of slop at any zoom, and
   * its id, or else the innermost zone's. A press and a Shift+click pick the same.
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
    const [dx, dy] = gridStep(this.store, [p[0] - g.start[0], p[1] - g.start[1]], e.alt);
    s.setDrag({ dx, dy, spin });
  }
}
