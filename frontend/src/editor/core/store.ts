/**
 * Client plan store (docs/0066): a vanilla Zustand store owned by the headless editor core.
 * React views subscribe through fine-grained selectors (docs/0052).
 *
 * The viewer loads a ready-made plan (`loadPlan`). The editor loads the plan as the API shapes
 * it (`loadDocument`) and changes it only through operations (docs/0050): each `perform` is one
 * undo step, and everything applied (including undo and redo) goes to the outbox that autosave
 * sends to the server.
 */
import { createStore } from "zustand/vanilla";

import type { WallDefaults } from "./edits";
import { planFromApi } from "./fromApi";
import { buildHitIndex, type HitIndex, moveObjects, withAttachments } from "./hitTest";
import { type ApiPlan, applyOps, type Op } from "./operations";
import type { Plan, Vec2 } from "./plan";
import type { SnapKind } from "./snap";
import type { DisplayUnit } from "./units";
import type { Viewport } from "./viewport";

export interface DragState {
  /** Current drag offset in plan mm (already snapped). */
  dx: number;
  dy: number;
}

export type ZoneTypes = ReadonlyMap<string, { name: string; color: string | null }>;

/** The editing tools of phase 3a so far (docs/0089). */
export type Tool = "select" | "wall" | "door" | "window" | "column" | "zone";

/** What a tool shows while it works, before anything is committed. */
export type Preview =
  /**
   * The wall chain being drawn (docs/0044): `start` is its first point (clicking it again closes
   * the room), `from` the last placed point (null before the first click), `to` the pointer.
   */
  | { kind: "wall"; start: Vec2 | null; from: Vec2 | null; to: Vec2; snap: SnapKind }
  /** A junction being dragged: these walls' endpoints at `from` follow the pointer. */
  | { kind: "junction"; from: Vec2; to: Vec2; walls: readonly string[]; snap: SnapKind }
  /**
   * A door or window being placed (no `id`) or slid along its wall (`id`); `wall_id` is null
   * while the pointer is over no wall it fits in.
   */
  | {
      kind: "opening";
      id?: string;
      type: "door" | "window";
      wall_id: string | null;
      offset_mm: number;
      width_mm: number;
    }
  /** A zone being drawn: the corners so far, and the pointer. */
  | { kind: "zone"; points: readonly Vec2[]; to: Vec2; snap: SnapKind }
  /** A zone corner being dragged. */
  | { kind: "vertex"; zone: string; index: number; to: Vec2; snap: SnapKind }
  /** A column about to be placed: its footprint. */
  | { kind: "column"; footprint: readonly Vec2[]; snap: SnapKind }
  | null;

interface Step {
  ops: Op[];
  inverse: Op[];
}

export interface EditorState {
  plan: Plan | null;
  hitIndex: HitIndex | null;
  selection: ReadonlySet<string>;
  drag: DragState | null;
  viewport: Viewport;
  displayUnit: DisplayUnit;
  gridMm: 10 | 50 | 100 | 500;
  gridSnap: boolean;
  /** The edited plan in API shape; null in the read-only viewer. */
  document: ApiPlan | null;
  zoneTypes: ZoneTypes;
  undoStack: readonly Step[];
  redoStack: readonly Step[];
  /** Applied operations not yet handed to autosave, oldest first. */
  outbox: readonly Op[];
  /** Counts `loadDocument` calls, so views can tell a freshly loaded plan from an edit. */
  generation: number;
  tool: Tool;
  preview: Preview;
  /** Thickness and height for new walls. */
  wallDefaults: WallDefaults;
  /** The zone type new zones get (docs/0020). */
  zoneTypeId: string | null;
  loadPlan(plan: Plan): void;
  /** Opens a plan for editing; clears the history and the outbox. */
  loadDocument(document: ApiPlan, zoneTypes: ZoneTypes): void;
  /** Applies one user action as a single undo step. */
  perform(ops: Op[]): void;
  undo(): void;
  redo(): void;
  /** Hands the outbox to autosave and empties it. */
  takeOutbox(): Op[];
  /** Puts operations that failed to send back in front of the outbox. */
  returnToOutbox(ops: Op[]): void;
  select(ids: Iterable<string>, additive?: boolean): void;
  clearSelection(): void;
  setViewport(viewport: Viewport): void;
  setDrag(drag: DragState | null): void;
  commitDrag(): void;
  setDisplayUnit(unit: DisplayUnit): void;
  toggleGridSnap(): void;
  setTool(tool: Tool): void;
  setPreview(preview: Preview): void;
  setWallDefaults(defaults: Partial<WallDefaults>): void;
  setZoneType(id: string): void;
}

/** Whether any element of the plan has this id. */
function exists(plan: Plan, id: string): boolean {
  return Boolean(
    plan.objects[id] ||
    plan.walls.some((w) => w.id === id) ||
    plan.openings.some((o) => o.id === id) ||
    plan.columns?.some((c) => c.id === id) ||
    plan.zones.some((z) => z.id === id),
  );
}

export function createEditorStore() {
  return createStore<EditorState>()((set, get) => {
    /** Applies ops to the document and refreshes everything derived from it. */
    const apply = (ops: readonly Op[]) => {
      const { document, zoneTypes, selection } = get();
      if (!document) throw new Error("no plan open for editing");
      const result = applyOps(document, ops);
      const plan = planFromApi(result.plan, zoneTypes);
      set({
        document: result.plan,
        plan,
        hitIndex: buildHitIndex(plan),
        // Whatever was deleted can't stay selected.
        selection: new Set([...selection].filter((id) => exists(plan, id))),
        drag: null,
        outbox: [...get().outbox, ...ops],
      });
      return result.inverse;
    };
    return {
      plan: null,
      hitIndex: null,
      selection: new Set(),
      drag: null,
      viewport: { cx: 0, cy: 0, mmPerPx: 20 },
      displayUnit: "cm",
      gridMm: 50, // 5 cm default (docs/0047)
      gridSnap: true,
      document: null,
      zoneTypes: new Map(),
      undoStack: [],
      redoStack: [],
      outbox: [],
      generation: 0,
      tool: "select",
      preview: null,
      wallDefaults: { thickness_mm: 150, height_mm: 3000 },
      zoneTypeId: null,
      loadPlan: (plan) =>
        set({ plan, hitIndex: buildHitIndex(plan), selection: new Set(), drag: null }),
      loadDocument: (document, zoneTypes) => {
        const plan = planFromApi(document, zoneTypes);
        set({
          document,
          zoneTypes,
          plan,
          hitIndex: buildHitIndex(plan),
          selection: new Set(),
          drag: null,
          undoStack: [],
          redoStack: [],
          outbox: [],
          generation: get().generation + 1,
        });
      },
      perform: (ops) => {
        if (!ops.length) return;
        const inverse = apply(ops);
        set({ undoStack: [...get().undoStack, { ops, inverse }], redoStack: [] });
      },
      undo: () => {
        const step = get().undoStack.at(-1);
        if (!step) return;
        apply(step.inverse);
        set({ undoStack: get().undoStack.slice(0, -1), redoStack: [...get().redoStack, step] });
      },
      redo: () => {
        const step = get().redoStack.at(-1);
        if (!step) return;
        apply(step.ops);
        set({ redoStack: get().redoStack.slice(0, -1), undoStack: [...get().undoStack, step] });
      },
      takeOutbox: () => {
        const ops = [...get().outbox];
        set({ outbox: [] });
        return ops;
      },
      returnToOutbox: (ops) => set({ outbox: [...ops, ...get().outbox] }),
      select: (ids, additive = false) => {
        const { plan, selection } = get();
        if (!plan) return;
        const base = additive ? [...selection, ...ids] : [...ids];
        set({ selection: withAttachments(plan, base) });
      },
      clearSelection: () => set({ selection: new Set() }),
      setViewport: (viewport) => set({ viewport }),
      setDrag: (drag) => set({ drag }),
      commitDrag: () => {
        const { plan, drag, selection, document } = get();
        if (!plan || !drag) return set({ drag: null });
        if (document) {
          // Editing: a move is one undoable step of position updates.
          const ops: Op[] = [];
          for (const c of plan.columns ?? []) {
            if (!selection.has(c.id) || (drag.dx === 0 && drag.dy === 0)) continue;
            const footprint = c.footprint.map((p) => [p[0] + drag.dx, p[1] + drag.dy]);
            ops.push({ op: "update", kind: "column", id: c.id, data: { footprint } });
          }
          for (const id of selection) {
            const o = plan.objects[id];
            if (!o || (drag.dx === 0 && drag.dy === 0)) continue;
            // Whole millimetres only (docs/0029).
            const position = [
              Math.round(o.position[0] + drag.dx),
              Math.round(o.position[1] + drag.dy),
              o.position[2],
            ];
            ops.push({ op: "update", kind: "object", id, data: { position } });
          }
          if (ops.length) get().perform(ops);
          return set({ drag: null });
        }
        const moved = moveObjects(plan, selection, drag.dx, drag.dy);
        set({ plan: moved, hitIndex: buildHitIndex(moved), drag: null });
      },
      setDisplayUnit: (displayUnit) => set({ displayUnit }),
      toggleGridSnap: () => set((s) => ({ gridSnap: !s.gridSnap })),
      setTool: (tool) => set({ tool, preview: null }),
      setPreview: (preview) => set({ preview }),
      setWallDefaults: (defaults) => set({ wallDefaults: { ...get().wallDefaults, ...defaults } }),
      setZoneType: (zoneTypeId) => set({ zoneTypeId }),
    };
  });
}

export type EditorStore = ReturnType<typeof createEditorStore>;
