/**
 * The panel on the end side of the editor (docs/0089 layout: right in English, left in Hebrew).
 * For now it shows the catalog while the item tool is on; the Properties and Problems tabs
 * join it in the next steps of phase 3a.
 */
import { useStore } from "zustand";

import type { EditorStore } from "@/editor/core/store";

import { ItemPicker } from "./ItemPicker";

export function SidePanel({ store }: { store: EditorStore }) {
  const tool = useStore(store, (s) => s.tool);
  if (tool !== "item") return null;
  return (
    <aside className="flex w-72 shrink-0 flex-col border-s bg-card">
      <ItemPicker store={store} />
    </aside>
  );
}
