/**
 * Options for the current tool, in a small bar over the top of the canvas (docs/0089 layout).
 * So far: the thickness of new walls, and the zone type new zones get.
 */
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { Select } from "@/components/ui/field";
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
