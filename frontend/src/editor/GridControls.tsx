/**
 * The grid size and grid snap, in a small bar on the canvas (docs/0047). The size is saved
 * with the user's preferences, so it follows them (docs/0092); G toggles grid snap and holding
 * Alt turns all snapping off while dragging or drawing.
 */
import { Magnet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { Select } from "@/components/ui/field";
import type { EditorState, EditorStore } from "@/editor/core/store";
import { useSavePreference } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const SIZES: EditorState["gridMm"][] = [10, 50, 100, 500];

export function GridControls({ store }: { store: EditorStore }) {
  const { t } = useTranslation();
  const gridMm = useStore(store, (s) => s.gridMm);
  const gridSnap = useStore(store, (s) => s.gridSnap);
  const save = useSavePreference();
  return (
    <div className="absolute start-3 bottom-3 flex items-center gap-1 rounded-md border bg-card p-1 text-xs shadow-sm">
      <button
        type="button"
        aria-pressed={gridSnap}
        title={t("editor.grid.snapHint")}
        onClick={() => store.getState().toggleGridSnap()}
        className={cn(
          "flex h-7 items-center gap-1 rounded px-2 text-muted-foreground hover:bg-muted [&_svg]:size-3.5",
          gridSnap && "bg-primary/10 text-primary hover:bg-primary/15",
        )}
      >
        <Magnet aria-hidden />
        {t("editor.grid.snap")}
      </button>
      <label htmlFor="grid-size" className="sr-only">
        {t("editor.grid.size")}
      </label>
      <Select
        id="grid-size"
        value={gridMm}
        className="h-7 w-24 text-xs"
        onChange={(e) => {
          const next = Number(e.target.value) as EditorState["gridMm"];
          store.getState().setGridMm(next);
          save.mutate({ grid_mm: next });
          e.target.blur(); // hand the keyboard back to the editor
        }}
      >
        {SIZES.map((mm) => (
          <option key={mm} value={mm}>
            {t("editor.grid.cm", { cm: mm / 10 })}
          </option>
        ))}
      </Select>
    </div>
  );
}
