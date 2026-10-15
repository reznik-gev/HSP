/**
 * Making an array of the selected items (docs/0049): rows, columns, the spacing between them
 * (starting at the selection's own size, so copies sit edge to edge) and mirrored rows for
 * back-to-back desks. The plan shows the copies while the form is open; Create adds them as
 * one undo step and selects everything.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { arrayOps } from "@/editor/core/array";
import type { EditorStore } from "@/editor/core/store";
import { formatLengthValue, parseLength } from "@/editor/core/units";

/** More copies than this at once is almost certainly a typo. */
const MAX_ITEMS = 400;

export function ArrayForm({ store }: { store: EditorStore }) {
  const { t } = useTranslation();
  const spec = useStore(store, (s) => s.arrayDraft)!;
  const unit = useStore(store, (s) => s.displayUnit);
  const [dxText, setDxText] = useState(formatLengthValue(spec.dx, unit));
  const [dyText, setDyText] = useState(formatLengthValue(spec.dy, unit));
  const set = (change: Partial<typeof spec>) =>
    store.getState().setArrayDraft({ ...spec, ...change });
  const count = spec.rows * spec.columns;
  const tooMany = count > MAX_ITEMS;
  const valid = spec.rows >= 1 && spec.columns >= 1 && count > 1 && !tooMany;

  const create = () => {
    const s = store.getState();
    if (!s.document || !valid) return;
    const { ops, ids } = arrayOps(s.document, s.selection, spec);
    const originals = [...s.selection];
    s.perform(ops);
    s.select([...originals, ...ids]);
    s.setArrayDraft(null);
  };

  const count1 = (key: "rows" | "columns") => (
    <label className="block space-y-1 text-xs text-muted-foreground">
      <span>{t(`editor.array.${key}`)}</span>
      <Input
        type="number"
        min={1}
        max={50}
        dir="ltr"
        value={spec[key]}
        onChange={(e) => set({ [key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
      />
    </label>
  );
  const spacing = (key: "dx" | "dy", text: string, setText: (v: string) => void) => {
    const invalid = parseLength(text, unit) === null;
    return (
      <label className="block space-y-1 text-xs text-muted-foreground">
        <span>{t(`editor.array.${key}`)}</span>
        <span className="relative block">
          <Input
            aria-label={t(`editor.array.${key}`)}
            dir="ltr"
            inputMode="decimal"
            className="pe-10 text-end"
            aria-invalid={invalid || undefined}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const mm = parseLength(e.target.value, unit);
              if (mm !== null) set({ [key]: mm });
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 end-3 flex items-center"
          >
            {unit}
          </span>
        </span>
      </label>
    );
  };

  return (
    <form
      className="space-y-4"
      aria-label={t("editor.array.title")}
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <h2 className="text-sm font-semibold">{t("editor.array.title")}</h2>
      <div className="grid grid-cols-2 gap-3">
        {count1("rows")}
        {count1("columns")}
        {spacing("dy", dyText, setDyText)}
        {spacing("dx", dxText, setDxText)}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={spec.mirror}
          onChange={(e) => set({ mirror: e.target.checked })}
          className="accent-[var(--primary)]"
        />
        {t("editor.array.mirror")}
      </label>
      <p className={tooMany ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {tooMany
          ? t("editor.array.tooMany", { max: MAX_ITEMS })
          : t("editor.array.count", { count })}
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!valid}>
          {t("editor.array.create")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => store.getState().setArrayDraft(null)}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
