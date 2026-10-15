/**
 * The Properties panel (docs/0045, docs/0089 layout): the selected element's measurements and
 * settings, editable in the user's display unit, with a units switch saved to their
 * preferences (docs/0046). Several elements of one kind are edited together.
 */
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { Select } from "@/components/ui/field";
import { describeSelection, setField, sharedValue } from "@/editor/core/properties";
import type { EditorStore } from "@/editor/core/store";
import type { DisplayUnit } from "@/editor/core/units";
import { useSavePreference } from "@/lib/preferences";

import { PropertyField } from "./PropertyField";

export function PropertiesPanel({ store }: { store: EditorStore }) {
  const { t } = useTranslation();
  const document = useStore(store, (s) => s.document);
  const plan = useStore(store, (s) => s.plan);
  const selection = useStore(store, (s) => s.selection);
  const zoneTypes = useStore(store, (s) => s.zoneTypes);
  const unit = useStore(store, (s) => s.displayUnit);
  const info = document && describeSelection(document, selection, zoneTypes);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!selection.size ? (
          <p className="text-sm text-muted-foreground">{t("editor.props.nothing")}</p>
        ) : !info ? (
          <p className="text-sm text-muted-foreground">
            {t("editor.props.several", { count: selection.size })}
          </p>
        ) : (
          <>
            <h2 className="text-sm font-semibold">
              {t(`editor.props.kinds.${info.kind}`, { count: info.elements.length })}
            </h2>
            {info.fields.map((field) => (
              <PropertyField
                key={field.key}
                field={field}
                value={sharedValue(field, info.elements)}
                unit={unit}
                onCommit={(value) => {
                  if (!plan || !document) return false;
                  const ops = setField(field, info.elements, value, { plan, document });
                  if (!ops) return false;
                  store.getState().perform(ops);
                  return true;
                }}
              />
            ))}
          </>
        )}
      </div>
      <UnitSwitch store={store} />
    </div>
  );
}

const UNITS: DisplayUnit[] = ["cm", "m", "mm"];

/** Centimetres, metres or millimetres, for this user everywhere (docs/0046). */
function UnitSwitch({ store }: { store: EditorStore }) {
  const { t } = useTranslation();
  const unit = useStore(store, (s) => s.displayUnit);
  const save = useSavePreference();
  return (
    <div className="flex items-center justify-between gap-2 border-t px-4 py-2 text-xs">
      <label htmlFor="display-unit" className="text-muted-foreground">
        {t("editor.props.units")}
      </label>
      <Select
        id="display-unit"
        value={unit}
        className="h-7 w-40"
        onChange={(e) => {
          const next = e.target.value as DisplayUnit;
          store.getState().setDisplayUnit(next);
          save.mutate({ display_units: next });
          e.target.blur();
        }}
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {t(`editor.props.unitNames.${u}`)}
          </option>
        ))}
      </Select>
    </div>
  );
}
