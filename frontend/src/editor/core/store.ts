/**
 * Client plan store (docs/0066): a vanilla Zustand store owned by the headless editor core.
 * React views subscribe through fine-grained selectors (docs/0052).
 *
 * The operation/undo model (docs/0036, 0050) replaces the direct plan updates here once the
 * editor proper is built.
 */
import { createStore } from "zustand/vanilla";

import { buildHitIndex, type HitIndex, moveObjects, withAttachments } from "./hitTest";
import type { Plan } from "./plan";
import type { DisplayUnit } from "./units";
import type { Viewport } from "./viewport";

export interface DragState {
  /** Current drag offset in plan mm (already snapped). */
  dx: number;
  dy: number;
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
  loadPlan(plan: Plan): void;
  select(ids: Iterable<string>, additive?: boolean): void;
  clearSelection(): void;
  setViewport(viewport: Viewport): void;
  setDrag(drag: DragState | null): void;
  commitDrag(): void;
  setDisplayUnit(unit: DisplayUnit): void;
  toggleGridSnap(): void;
}

export function createEditorStore() {
  return createStore<EditorState>()((set, get) => ({
    plan: null,
    hitIndex: null,
    selection: new Set(),
    drag: null,
    viewport: { cx: 0, cy: 0, mmPerPx: 20 },
    displayUnit: "cm",
    gridMm: 50, // 5 cm default (docs/0047)
    gridSnap: true,
    loadPlan: (plan) =>
      set({ plan, hitIndex: buildHitIndex(plan), selection: new Set(), drag: null }),
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
      const { plan, drag, selection } = get();
      if (!plan || !drag) return set({ drag: null });
      const moved = moveObjects(plan, selection, drag.dx, drag.dy);
      set({ plan: moved, hitIndex: buildHitIndex(moved), drag: null });
    },
    setDisplayUnit: (displayUnit) => set({ displayUnit }),
    toggleGridSnap: () => set((s) => ({ gridSnap: !s.gridSnap })),
  }));
}

export type EditorStore = ReturnType<typeof createEditorStore>;
