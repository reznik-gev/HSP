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

import { planFromApi } from "./fromApi";
import { buildHitIndex, type HitIndex, moveObjects, withAttachments } from "./hitTest";
import { type ApiPlan, applyOps, type Op } from "./operations";
import type { Plan } from "./plan";
import type { DisplayUnit } from "./units";
import type { Viewport } from "./viewport";

export interface DragState {
  /** Current drag offset in plan mm (already snapped). */
  dx: number;
  dy: number;
}

export type ZoneTypes = ReadonlyMap<string, { name: string; color: string | null }>;

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
        selection: new Set([...selection].filter((id) => plan.objects[id])),
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
    };
  });
}

export type EditorStore = ReturnType<typeof createEditorStore>;
