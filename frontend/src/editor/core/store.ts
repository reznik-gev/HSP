/**
 * Client plan store (docs/0066): a vanilla Zustand store owned by the headless editor core.
 * React views subscribe through fine-grained selectors (docs/0052).
 *
 * This is the skeleton: element collections and the operation/undo model (docs/0036, 0050)
 * are added with the editor work, after the SVG performance spike (docs/0052).
 */
import { createStore } from "zustand/vanilla";

import type { DisplayUnit } from "./units";

export interface EditorState {
  floorId: string | null;
  selection: ReadonlySet<string>;
  displayUnit: DisplayUnit;
  gridMm: 10 | 50 | 100 | 500;
  gridSnap: boolean;
  select(ids: Iterable<string>): void;
  clearSelection(): void;
  setDisplayUnit(unit: DisplayUnit): void;
  toggleGridSnap(): void;
}

export function createEditorStore() {
  return createStore<EditorState>()((set) => ({
    floorId: null,
    selection: new Set(),
    displayUnit: "cm",
    gridMm: 50, // 5 cm default (docs/0047)
    gridSnap: true,
    select: (ids) => set({ selection: new Set(ids) }),
    clearSelection: () => set({ selection: new Set() }),
    setDisplayUnit: (displayUnit) => set({ displayUnit }),
    toggleGridSnap: () => set((s) => ({ gridSnap: !s.gridSnap })),
  }));
}

export type EditorStore = ReturnType<typeof createEditorStore>;
