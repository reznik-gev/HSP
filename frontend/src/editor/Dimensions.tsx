/**
 * The selection's dimensions (docs/0045, see core/dimensions.ts): lines drawn over the plan and
 * a label on each that can be clicked and typed into. Hidden while dragging, when they'd lag.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { type Dimension, dimensionsFor } from "@/editor/core/dimensions";
import type { Interaction } from "@/editor/core/interaction";
import type { EditorStore } from "@/editor/core/store";
import { formatLength, formatLengthValue, parseLength } from "@/editor/core/units";

/** How far beside a wall its dimension line runs, in screen pixels. */
const OFFSET_PX = 20;

function useDimensions(store: EditorStore): Dimension[] {
  const plan = useStore(store, (s) => s.plan);
  const selection = useStore(store, (s) => s.selection);
  const px = useStore(store, (s) => s.viewport.mmPerPx);
  const dragging = useStore(store, (s) => s.drag !== null);
  if (!plan || dragging) return [];
  return dimensionsFor(plan, selection, OFFSET_PX * px);
}

/** The lines, inside the plan's SVG (plan millimetres, y up). */
export function DimensionLines({ store }: { store: EditorStore }) {
  const dims = useDimensions(store);
  const px = useStore(store, (s) => s.viewport.mmPerPx);
  return (
    <g pointerEvents="none" data-testid="dimensions">
      {dims.map((d) => (
        <g key={d.key} className="plan-dimension">
          <line
            x1={d.from[0]}
            y1={d.from[1]}
            x2={d.to[0]}
            y2={d.to[1]}
            stroke="var(--primary)"
            strokeWidth={px}
            strokeDasharray={`${4 * px} ${3 * px}`}
          />
          {[d.from, d.to].map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={2.5 * px} fill="var(--primary)" />
          ))}
        </g>
      ))}
    </g>
  );
}

/** The labels, over the canvas: click one to type a new value. */
export function DimensionLabels({
  store,
  interaction,
}: {
  store: EditorStore;
  interaction: Interaction;
}) {
  const dims = useDimensions(store);
  useStore(store, (s) => s.viewport); // follow pan and zoom
  return (
    <>
      {dims.map((d) => {
        const mid = interaction.screenOf([(d.from[0] + d.to[0]) / 2, (d.from[1] + d.to[1]) / 2]);
        return <Label key={`${d.key}-${d.valueMm}`} store={store} dim={d} at={mid} />;
      })}
    </>
  );
}

function Label({ store, dim, at }: { store: EditorStore; dim: Dimension; at: [number, number] }) {
  const { t } = useTranslation();
  const unit = useStore(store, (s) => s.displayUnit);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(formatLengthValue(dim.valueMm, unit));
  const [invalid, setInvalid] = useState(false);
  const name = t(`editor.dimensions.${dim.key}`);
  const style = { left: at[0], top: at[1] };
  if (!editing) {
    return (
      <button
        type="button"
        className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground tabular-nums shadow-sm hover:bg-primary/90"
        style={style}
        dir="ltr"
        aria-label={t("editor.dimensions.edit", {
          what: name,
          value: formatLength(dim.valueMm, unit),
        })}
        onClick={() => setEditing(true)}
      >
        {formatLength(dim.valueMm, unit)}
      </button>
    );
  }
  const apply = () => {
    const mm = parseLength(text, unit);
    const ops = mm === null ? null : dim.edit(mm);
    if (!ops) return setInvalid(true);
    if (ops.length) store.getState().perform(ops);
    setEditing(false);
  };
  return (
    <input
      // Opened by a click on the label, to type into.
      autoFocus
      aria-label={name}
      aria-invalid={invalid || undefined}
      dir="ltr"
      inputMode="decimal"
      className="absolute z-10 h-7 w-20 -translate-x-1/2 -translate-y-1/2 rounded border bg-popover px-1.5 text-end text-xs shadow-md aria-invalid:border-destructive"
      style={style}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        setInvalid(false);
      }}
      onFocus={(e) => e.target.select()}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter") apply();
        else if (e.key === "Escape") setEditing(false);
        else return;
        e.preventDefault();
      }}
    />
  );
}
