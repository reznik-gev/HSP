/**
 * Options for the current tool, in a small bar over the top of the canvas (docs/0089 layout).
 * So far: the thickness of new walls, the zone type new zones get, and the seat-numbering
 * pattern.
 */
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { Input, Select } from "@/components/ui/field";
import { floorLabels, nextFree, parsePattern } from "@/editor/core/numbering";
import type { EditorStore } from "@/editor/core/store";

import { PropertyField } from "./properties/PropertyField";

export function ToolOptions({ store }: { store: EditorStore }) {
  const { t } = useTranslation();
  const tool = useStore(store, (s) => s.tool);
  const zoneTypes = useStore(store, (s) => s.zoneTypes);
  const zoneTypeId = useStore(store, (s) => s.zoneTypeId);
  const thickness = useStore(store, (s) => s.wallDefaults.thickness_mm);
  const unit = useStore(store, (s) => s.displayUnit);
  if (tool === "wall") {
    return (
      <div className="absolute start-3 top-3 w-48 rounded-md border bg-card px-3 py-2 shadow-sm">
        <PropertyField
          field={{ key: "newWallThickness", kind: "length", get: () => thickness }}
          value={thickness}
          unit={unit}
          onCommit={(v) => {
            if (typeof v !== "number" || v <= 0) return false;
            store.getState().setWallDefaults({ thickness_mm: v });
            return true;
          }}
        />
      </div>
    );
  }
  if (tool === "number") return <NumberingOptions store={store} />;
  if (tool !== "zone") return null;
  return (
    <div className="absolute start-3 top-3 flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm shadow-sm">
      <label htmlFor="zone-type" className="text-muted-foreground">
        {t("editor.zoneType")}
      </label>
      <Select
        id="zone-type"
        value={zoneTypeId ?? ""}
        onChange={(e) => {
          store.getState().setZoneType(e.target.value);
          // Hand the keyboard back to the editor (Enter closes the zone, letters pick tools).
          e.target.blur();
        }}
        className="h-8 w-44"
      >
        {[...zoneTypes].map(([id, type]) => (
          <option key={id} value={id}>
            {type.name}
          </option>
        ))}
      </Select>
      <span className="text-xs text-muted-foreground">{t("editor.zoneHint")}</span>
    </div>
  );
}

/** The numbering pattern, e.g. HT-3-{01}, and the label the next seat gets (docs/0049). */
function NumberingOptions({ store }: { store: EditorStore }) {
  const { t } = useTranslation();
  const numbering = useStore(store, (s) => s.numbering);
  const taken = useStore(store, (s) => s.takenLabels);
  const plan = useStore(store, (s) => s.plan);
  const pattern = parsePattern(numbering.pattern);
  const next =
    pattern && plan
      ? nextFree(pattern, numbering.next, new Set([...taken, ...floorLabels(plan)])).label
      : null;
  return (
    <div className="absolute start-3 top-3 flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm shadow-sm">
      <label htmlFor="numbering-pattern" className="text-muted-foreground">
        {t("editor.numbering.pattern")}
      </label>
      <Input
        id="numbering-pattern"
        dir="ltr"
        className="h-8 w-36"
        value={numbering.pattern}
        aria-invalid={!pattern || undefined}
        onChange={(e) => store.getState().setNumbering({ pattern: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
        }}
      />
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {next ? t("editor.numbering.next", { label: next }) : t("editor.numbering.invalid")}
      </span>
    </div>
  );
}
