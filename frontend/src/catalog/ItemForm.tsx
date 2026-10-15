/**
 * Creating or changing one of the organisation's own catalog items (docs/0021, docs/0083,
 * docs/0095): name, category, shape, size in cm, colour and flags, with a live top-down preview.
 * Changing the shape, size, colour or flags makes a new revision: items already on floors keep
 * theirs and are never updated (docs/0095 decision 3), and the form says so before saving.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { ApiProblem, asProblem, fieldErrors, problemMessage, problemSlug } from "@/api/problems";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { notify, notifyError } from "@/lib/notify";

import { type CatalogItem, catalogItemsQuery, categoryName } from "./data";
import { ItemPreview } from "./ItemPreview";

type Shape = "box" | "cylinder" | "l_shape";
const SHAPES: Shape[] = ["box", "cylinder", "l_shape"];
const FLAGS = ["is_seat", "mountable", "footprint_blocks"] as const;
/** Fields whose change adds a revision (the server's REVISION_FIELDS). */
const REVISION_FIELDS = [
  "shape",
  "width_mm",
  "depth_mm",
  "height_mm",
  "color",
  "is_seat",
  "mountable",
  "attaches_to_categories",
  "footprint_blocks",
] as const;

interface Values {
  name: string;
  category: string;
  shape: Shape;
  /** Centimetres as typed. */
  width: string;
  depth: string;
  height: string;
  /** Null until a colour is picked: the plan then uses its default for the category. */
  color: string | null;
  is_seat: boolean;
  mountable: boolean;
  footprint_blocks: boolean;
  attaches_to_categories: string[];
}

const toMm = (cm: string) => Math.round(Number(cm.replace(",", ".")) * 10);
const toCm = (mm: number) => String(mm / 10);

/** A key for a new item from its name (docs/0083 slugs); Hebrew names fall back to `item`. */
export function keyFor(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+|_+$/g, "");
  return (slug || "item").slice(0, 40);
}

function initial(item: CatalogItem | null): Values {
  const rev = item?.current_revision;
  return {
    name: item?.name ?? "",
    category: item?.category ?? "",
    shape: (rev?.shape as Shape | undefined) ?? "box",
    width: rev ? toCm(rev.width_mm) : "",
    depth: rev ? toCm(rev.depth_mm) : "",
    height: rev ? toCm(rev.height_mm) : "",
    color: rev?.color ?? null,
    is_seat: rev?.is_seat ?? false,
    mountable: rev?.mountable ?? false,
    footprint_blocks: rev?.footprint_blocks ?? true,
    attaches_to_categories: rev?.attaches_to_categories ?? [],
  };
}

function body(v: Values) {
  return {
    name: v.name.trim(),
    category: v.category.trim(),
    shape: v.shape,
    width_mm: toMm(v.width),
    depth_mm: toMm(v.depth),
    height_mm: toMm(v.height),
    color: v.color,
    is_seat: v.is_seat,
    mountable: v.mountable,
    footprint_blocks: v.footprint_blocks,
    attaches_to_categories: v.attaches_to_categories,
  };
}

/** Edits `item`, or creates a new item when it's null. */
export function ItemForm({
  item,
  onSaved,
}: {
  item: CatalogItem | null;
  onSaved: (saved: CatalogItem) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const all = useQuery(catalogItemsQuery(false));
  const categories = [...new Set((all.data ?? []).map((i) => i.category))].sort();
  const [values, setValues] = useState(() => initial(item));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (change: Partial<Values>) => setValues((v) => ({ ...v, ...change }));

  const sent = body(values);
  const rev = item?.current_revision;
  const newRevision =
    !!rev &&
    REVISION_FIELDS.some((f) =>
      f === "attaches_to_categories"
        ? [...sent[f]].sort().join() !== [...rev[f]].sort().join()
        : sent[f] !== rev[f],
    );

  const save = useMutation({
    mutationFn: async (): Promise<CatalogItem> => {
      if (item) {
        const { data, error } = await api.PATCH("/api/v1/catalog-items/{item_id}", {
          params: { path: { item_id: item.id } },
          body: sent,
        });
        if (error || !data) throw new ApiProblem(asProblem(error));
        return data;
      }
      // A new item gets a key from its name, numbered if that's taken.
      const base = keyFor(sent.name);
      for (let n = 1; n <= 20; n++) {
        const key = n === 1 ? base : `${base}_${n}`;
        const { data, error } = await api.POST("/api/v1/catalog-items", { body: { ...sent, key } });
        if (data) return data;
        if (problemSlug(asProblem(error)) !== "key-taken") throw new ApiProblem(asProblem(error));
      }
      throw new Error("No free key");
    },
    onSuccess: (saved) => {
      setErrors({});
      void client.invalidateQueries({ queryKey: ["catalog-items"] });
      notify(t(item ? "catalog.saved" : "catalog.created", { name: saved.name }));
      onSaved(saved);
    },
    onError: (error) => {
      const problem = asProblem(error);
      const byField = fieldErrors(problem);
      if (byField.category) byField.category = t("catalog.errors.category");
      for (const f of ["width_mm", "depth_mm", "height_mm"] as const) {
        if (byField[f]) byField[f] = t("catalog.errors.size");
      }
      setErrors(byField);
      if (!Object.keys(byField).length) notifyError(problemMessage(problem, t("common.failed")));
    },
  });

  const size = (name: "width" | "depth" | "height", field: string) => (
    <Field label={t(`catalog.fields.${name}`)} error={errors[field]}>
      {(control) => (
        <Input
          {...control}
          type="number"
          inputMode="decimal"
          min="0.1"
          step="0.1"
          required
          dir="ltr"
          aria-label={t(`catalog.fields.${name}Cm`)}
          value={values[name]}
          onChange={(e) => set({ [name]: e.target.value })}
        />
      )}
    </Field>
  );

  const preview = {
    shape: values.shape,
    width_mm: toMm(values.width) || 1,
    depth_mm: toMm(values.depth) || 1,
    color: values.color,
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <ItemPreview
        item={preview}
        className="mx-auto h-32 w-full max-w-64"
        label={t("catalog.previewLabel", { name: values.name || t("catalog.newItem") })}
      />
      <Field label={t("catalog.fields.name")} error={errors.name}>
        {(control) => (
          <Input
            {...control}
            required
            autoComplete="off"
            value={values.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        )}
      </Field>
      <Field
        label={t("catalog.fields.category")}
        hint={t("catalog.categoryHint")}
        error={errors.category}
      >
        {(control) => (
          <>
            <Input
              {...control}
              required
              dir="ltr"
              list="catalog-categories"
              autoComplete="off"
              value={values.category}
              onChange={(e) => set({ category: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
            />
            <datalist id="catalog-categories">
              {categories.map((c) => (
                <option key={c} value={c} label={categoryName(t, c)} />
              ))}
            </datalist>
          </>
        )}
      </Field>
      <Field label={t("catalog.fields.shape")}>
        {(control) => (
          <Select
            {...control}
            value={values.shape}
            onChange={(e) => set({ shape: e.target.value as Shape })}
          >
            {SHAPES.map((s) => (
              <option key={s} value={s}>
                {t(`catalog.shapes.${s}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <fieldset className="grid grid-cols-3 gap-3">
        <legend className="mb-1.5 text-sm font-medium">{t("catalog.fields.sizeCm")}</legend>
        {size("width", "width_mm")}
        {size("depth", "depth_mm")}
        {size("height", "height_mm")}
      </fieldset>
      <Field label={t("catalog.fields.color")}>
        {(control) => (
          <Input
            {...control}
            type="color"
            className="h-9 w-20 p-1"
            value={values.color ?? "#d6d3d1"}
            onChange={(e) => set({ color: e.target.value })}
          />
        )}
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">{t("catalog.fields.flags")}</legend>
        {FLAGS.map((f) => (
          <label key={f} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={values[f]}
              onChange={(e) => set({ [f]: e.target.checked })}
              className="mt-0.5 size-4 accent-[var(--primary)]"
            />
            <span>
              {t(`catalog.flags.${f}`)}
              <span className="block text-xs text-muted-foreground">
                {t(`catalog.flags.${f}Hint`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {categories.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium">{t("catalog.fields.attachesTo")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {categories.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={values.attaches_to_categories.includes(c)}
                  onChange={(e) =>
                    set({
                      attaches_to_categories: e.target.checked
                        ? [...values.attaches_to_categories, c]
                        : values.attaches_to_categories.filter((x) => x !== c),
                    })
                  }
                  className="size-4 accent-[var(--primary)]"
                />
                {categoryName(t, c)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {newRevision && (
        <p role="note" className="rounded-md bg-muted px-3 py-2 text-sm">
          {t("catalog.revisionNote")}
        </p>
      )}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? t("common.saving") : t(item ? "common.save" : "catalog.create")}
      </Button>
    </form>
  );
}
