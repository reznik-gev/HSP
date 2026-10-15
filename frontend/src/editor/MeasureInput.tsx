/**
 * The typed-measurement box (docs/0045): opens at the pointer when a digit is typed while
 * drawing a wall or dragging. Length in the display unit (or with its own unit, "3.5m"),
 * optionally an angle (Tab, or "350<90"); Enter applies it, Escape or clicking away closes it.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { Input } from "@/components/ui/field";
import type { Interaction } from "@/editor/core/interaction";
import { parseMeasure } from "@/editor/core/measure";
import type { EditorStore } from "@/editor/core/store";

export function MeasureInput({
  store,
  interaction,
}: {
  store: EditorStore;
  interaction: Interaction;
}) {
  const measure = useStore(store, (s) => s.measure);
  if (!measure) return null;
  // A fresh box (and fresh text) every time it opens.
  return <Box key={`${measure.sx},${measure.sy}`} store={store} interaction={interaction} />;
}

function Box({ store, interaction }: { store: EditorStore; interaction: Interaction }) {
  const { t } = useTranslation();
  const measure = useStore(store, (s) => s.measure)!;
  const unit = useStore(store, (s) => s.displayUnit);
  const withAngle = interaction.measureTarget() === "wall";
  const [length, setLength] = useState(measure.first);
  const [angle, setAngle] = useState("");
  const [invalid, setInvalid] = useState(false);
  const close = () => store.getState().setMeasure(null);
  const apply = () => {
    const m = parseMeasure(length, angle, unit);
    if (!m || !interaction.applyMeasure(m)) return setInvalid(true);
    close();
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") apply();
    else if (e.key === "Escape") close();
    else return;
    e.preventDefault();
  };
  return (
    <div
      role="group"
      aria-label={t("editor.measure.label")}
      className="absolute z-10 flex items-end gap-2 rounded-md border bg-popover p-2 shadow-md"
      // The canvas never mirrors, so this sits right-and-below the pointer in any language.
      style={{ left: measure.sx + 16, top: measure.sy + 16 }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <Field label={t("editor.measure.length")} suffix={unit}>
        <Input
          aria-label={t("editor.measure.length")}
          // The box opens because the user is typing into it.
          autoFocus
          dir="ltr"
          inputMode="decimal"
          className="h-8 w-24 pe-9 text-end"
          aria-invalid={invalid || undefined}
          value={length}
          onChange={(e) => {
            setLength(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={keys}
        />
      </Field>
      {withAngle && (
        <Field label={t("editor.measure.angle")} suffix="°">
          <Input
            aria-label={t("editor.measure.angle")}
            dir="ltr"
            inputMode="decimal"
            className="h-8 w-16 pe-6 text-end"
            value={angle}
            placeholder="–"
            onChange={(e) => {
              setAngle(e.target.value);
              setInvalid(false);
            }}
            onKeyDown={keys}
          />
        </Field>
      )}
      {invalid && (
        <p role="alert" className="pb-1.5 text-xs text-destructive">
          {t("editor.measure.invalid")}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      <span aria-hidden>{label}</span>
      <span className="relative block">
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 end-2 flex items-center"
        >
          {suffix}
        </span>
      </span>
    </div>
  );
}
