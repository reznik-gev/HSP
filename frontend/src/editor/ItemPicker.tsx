/**
 * Choosing what the item tool places (docs/0089 layout): the catalog by category, with a
 * search box. The chosen item follows the pointer on the plan until the tool changes.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { Input } from "@/components/ui/field";
import type { EditorStore } from "@/editor/core/store";
import { formatLength } from "@/editor/core/units";
import { cn } from "@/lib/utils";

import { catalogQuery } from "./session/catalog";

export function ItemPicker({ store }: { store: EditorStore }) {
  const { t, i18n } = useTranslation();
  const catalog = useQuery(catalogQuery);
  const placing = useStore(store, (s) => s.placing);
  const unit = useStore(store, (s) => s.displayUnit);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = (catalog.data ?? []).filter(
    (i) => !query || `${i.name} ${i.key} ${i.category}`.toLowerCase().includes(query),
  );
  const collator = new Intl.Collator(i18n.resolvedLanguage);
  const categories = [...new Set(matches.map((i) => i.category))].sort(collator.compare);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b p-3">
        <h2 className="text-sm font-semibold">{t("editor.items.title")}</h2>
        <Input
          type="search"
          aria-label={t("editor.items.search")}
          placeholder={t("editor.items.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("editor.items.hint")}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {catalog.isError && (
          <p role="alert" className="p-2 text-sm text-destructive">
            {t("editor.items.loadFailed")}
          </p>
        )}
        {catalog.data && !matches.length && (
          <p className="p-2 text-sm text-muted-foreground">{t("editor.items.none")}</p>
        )}
        {categories.map((category) => (
          <section key={category} className="mb-3">
            <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
              {t(`editor.categories.${category}`, { defaultValue: category })}
            </h3>
            <ul>
              {matches
                .filter((i) => i.category === category)
                .map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={placing?.id === item.id}
                      onClick={(e) => {
                        store.getState().setPlacing(item);
                        e.currentTarget.blur(); // keep R and the tool letters for the plan
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted",
                        placing?.id === item.id && "bg-primary/10 text-primary hover:bg-primary/15",
                      )}
                    >
                      <span className="truncate">{item.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground" dir="ltr">
                        {formatLength(item.width_mm, unit)} × {formatLength(item.depth_mm, unit)}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
