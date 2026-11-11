/**
 * Renderer-agnostic pointer and keyboard interaction (docs/0052). Views translate raw input
 * into these calls (screen pixels relative to the canvas, plus button and modifiers); the core
 * decides what it means for the current tool and updates the store.
 *
 * Interaction is a router: it sends pointer events to the current tool's class in `tools/`,
 * and keeps the view (pan, zoom, `screenOf`, `planAt`, `focus`), typed distances (docs/0045)
 * and keyboard commands.
 * Select tool: click selects, drags move what's selected; see SelectTool. A press it doesn't
 * take (a wall not yet selected, a zone, empty space) pans, and a click on empty space clears
 * the selection.
 * Drawing tools (wall, door, window, column, zone, item): a click places, a drag pans; see
 * their classes. R turns the item being placed, or the selected furniture, a quarter turn;
 * furniture being dragged turns where it has been dragged to, and the drag carries on (docs/0135).
 * The middle button always pans and the wheel zooms (PanZoom, shared with the viewer).
 */
import { deleteSelection, nudgeOps, type OpeningType, rotateObjects } from "./edits";
import { viewportFor } from "./focus";
import type { Measure } from "./measure";
import type { Vec2 } from "./plan";
import type { EditorStore } from "./store";
import { ColumnTool } from "./tools/columnTool";
import { ItemTool } from "./tools/itemTool";
import { NumberTool } from "./tools/numberTool";
import { OpeningTool } from "./tools/openingTool";
import { SelectTool } from "./tools/selectTool";
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

type Gesture =
  | { kind: "none" }
  /** `clickClears`: a click without moving (on empty space) clears the selection. */
  | { kind: "pan"; clickClears?: boolean }
  /** A Select gesture, which SelectTool follows. */
  | { kind: "select" }
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
  private readonly selectTool: SelectTool;

  constructor(private readonly store: EditorStore) {
    this.view = new PanZoom(store);
    this.wallTool = new WallTool(store);
    this.openingTool = new OpeningTool(store);
    this.columnTool = new ColumnTool(store);
    this.zoneTool = new ZoneTool(store);
    this.itemTool = new ItemTool(store);
    this.numberTool = new NumberTool(store);
    this.selectTool = new SelectTool(store, this.view);
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
    const press = this.selectTool.press(e);
    if (press.pan) this.pan(e, press.pan.clickClears);
    else this.gesture = { kind: "select" };
    return press.result;
  }

  pointerMove(e: PointerInput): void {
    this.lastPointer = { sx: e.sx, sy: e.sy };
    this.store.getState().setSnapFree(Boolean(e.alt));
    this.store.getState().setSnapStraight(e.shift);
    const s = this.store.getState();
    const g = this.gesture;
    if (g.kind === "pan") {
      this.view.movePan(e.sx, e.sy);
    } else if (g.kind === "select") {
      this.selectTool.move(e);
    } else if (g.kind === "numbering") {
      this.numberTool.extend(this.toPlan(e));
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
    if (g.kind === "select") {
      this.selectTool.release(e);
    } else if (g.kind === "numbering") {
      this.numberTool.end();
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
    if (this.gesture.kind === "select" && this.selectTool.moving()) return "move";
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
      this.selectTool.moveBy(d);
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
        // Drops a selection rectangle or a group's move first (docs/0133).
        if (this.gesture.kind === "select" && this.selectTool.cancel()) return true;
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
        // Mid-drag: turned where it's been dragged to, and the drag carries on (docs/0135).
        if (this.gesture.kind === "select" && this.selectTool.spin()) return true;
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
