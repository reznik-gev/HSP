/**
 * Editor keyboard shortcuts, while editing and not typing in a field:
 * - Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes (docs/0050);
 * - Ctrl+C copies the selection; Ctrl+V pastes in place, Ctrl+Shift+V at the pointer (docs/0049);
 * - a tool's letter picks it (V select, W wall, …);
 * - Escape, Enter, Delete and Backspace go to the current tool (end a wall chain, delete the
 *   selection, …);
 * - a digit while drawing a wall or dragging opens the typed-measurement box (docs/0045).
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { Interaction } from "@/editor/core/interaction";
import type { EditorStore } from "@/editor/core/store";

import { copySelection, pasteCopied } from "./clipboardActions";
import { TOOLS } from "./ToolStrip";

export function useEditorKeys(store: EditorStore, interaction: Interaction, enabled: boolean) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === "z" && !e.shiftKey) store.getState().undo();
        else if ((key === "z" && e.shiftKey) || key === "y") store.getState().redo();
        else if (key === "c") {
          if (!copySelection(store, t)) return;
        } else if (key === "v") void pasteCopied(store, interaction, e.shiftKey, t);
        else return;
      } else if (e.altKey) {
        return;
      } else if (/^[0-9.,]$/.test(e.key) && interaction.measureTarget()) {
        store.getState().setMeasure({ ...interaction.lastPointer, first: e.key });
      } else {
        const tool = TOOLS.find((x) => x.key.toLowerCase() === key);
        if (tool) store.getState().setTool(tool.tool);
        else if (!interaction.key(e.key)) return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, interaction, enabled, t]);
}
