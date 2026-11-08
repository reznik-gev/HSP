/**
 * The hint line at the bottom of the canvas (docs/0129): what you can do now and which keys
 * change it, for the current tool, selection or drag. It ends with "All keys (?)", which opens
 * the Keyboard and mouse sheet.
 */
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { editorHint } from "@/editor/core/hints";
import type { EditorStore } from "@/editor/core/store";

export function HintLine({ store, onAllKeys }: { store: EditorStore; onAllKeys: () => void }) {
  const { t } = useTranslation();
  const tool = useStore(store, (s) => s.tool);
  const plan = useStore(store, (s) => s.plan);
  const selection = useStore(store, (s) => s.selection);
  const preview = useStore(store, (s) => s.preview);
  const drag = useStore(store, (s) => s.drag);
  const hint = editorHint({ tool, plan, selection, preview, drag });
  const text = t(`editor.hints.${hint.key}`, { walls: hint.walls });
  return (
    // Clear of the grid controls at the bottom start corner.
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-60">
      <p
        role="status"
        className="pointer-events-auto rounded-md border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
      >
        {text}{" "}
        <button
          type="button"
          onClick={onAllKeys}
          className="font-medium whitespace-nowrap text-primary hover:underline"
        >
          {t("editor.hints.allKeys")}
        </button>
      </p>
    </div>
  );
}
