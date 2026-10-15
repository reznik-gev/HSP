/**
 * The panel on the end side of the editor (docs/0089 layout: right in English, left in Hebrew):
 * the catalog while the item tool is on, otherwise the selection's properties. The Problems
 * tab joins it in the next step of phase 3a.
 */
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import type { EditorStore } from "@/editor/core/store";

import { ItemPicker } from "./ItemPicker";
import { PropertiesPanel } from "./properties/PropertiesPanel";

export function SidePanel({ store }: { store: EditorStore }) {
  const { t } = useTranslation();
  const tool = useStore(store, (s) => s.tool);
  return (
    <aside
      aria-label={t(tool === "item" ? "editor.items.title" : "editor.props.panel")}
      className="flex w-72 shrink-0 flex-col border-s bg-card"
    >
      {tool === "item" ? <ItemPicker store={store} /> : <PropertiesPanel store={store} />}
    </aside>
  );
}
