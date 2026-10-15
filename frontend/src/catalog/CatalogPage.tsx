/**
 * The Catalog (docs/0095, admins): every item by category, with search and a Built-in /
 * Custom / Archived filter, and the open item in a side panel. Search, filter and the open
 * item live in the address, like the People page (docs/0088).
 */
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Page } from "@/app/Page";
import { useIsAdmin } from "@/auth/admin";
import { Button } from "@/components/ui/button";
import { inputClass, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

import { type CatalogItem, catalogItemsQuery, categoryName, sizeText } from "./data";
import { FlagBadges } from "./FlagBadges";
import { ItemPanel } from "./ItemPanel";
import { ItemPreview } from "./ItemPreview";
import type { CatalogSearch, CatalogShow } from "./search";

const route = getRouteApi("/shell/catalog");

export function CatalogPage() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const search = route.useSearch();
  const navigate = useNavigate({ from: "/catalog" });
  const set = (change: Partial<CatalogSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });

  if (!isAdmin) {
    return (
      <Page title={t("catalog.title")}>
        <p className="text-muted-foreground">{t("catalog.adminsOnly")}</p>
      </Page>
    );
  }
  return (
    <Page title={t("catalog.title")}>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={search.q ?? ""} onChange={(q) => set({ q: q || undefined })} />
        <Select
          aria-label={t("catalog.show.label")}
          value={search.show ?? ""}
          onChange={(e) => set({ show: (e.target.value || undefined) as CatalogShow | undefined })}
          className="w-44"
        >
          <option value="">{t("catalog.show.all")}</option>
          <option value="builtin">{t("catalog.show.builtin")}</option>
          <option value="custom">{t("catalog.show.custom")}</option>
          <option value="archived">{t("catalog.show.archived")}</option>
        </Select>
        <div className="ms-auto">
          <Button onClick={() => set({ new: true, item: undefined })}>
            <Plus aria-hidden />
            {t("catalog.newItem")}
          </Button>
        </div>
      </div>
      <div className="mt-5">
        <ItemList search={search} />
      </div>
      {(search.item ?? search.new) && (
        <ItemPanel
          itemId={search.item ?? null}
          onClose={() => set({ item: undefined, new: undefined })}
          onOpen={(id) => set({ item: id, new: undefined, show: undefined })}
        />
      )}
    </Page>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  return (
    <div className="relative w-72">
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={draft}
        aria-label={t("catalog.search")}
        placeholder={t("catalog.search")}
        className={cn(inputClass, "ps-9")}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = e.target.value.trim();
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => onChange(next), 200);
        }}
      />
    </div>
  );
}

/** Whether `item` belongs in the list for the filter and search text. */
function shown(item: CatalogItem, show: CatalogShow | undefined, q: string, category: string) {
  if (show === "archived" ? !item.archived_at : item.archived_at) return false;
  if (show === "builtin" && !item.builtin) return false;
  if (show === "custom" && item.builtin) return false;
  return !q || `${item.name} ${item.key} ${category}`.toLowerCase().includes(q);
}

function ItemList({ search }: { search: CatalogSearch }) {
  const { t, i18n } = useTranslation();
  const items = useQuery(catalogItemsQuery(search.show === "archived"));
  if (items.isPending) return null;
  if (items.isError) {
    return (
      <p role="alert" className="text-destructive">
        {t("catalog.loadFailed")}
      </p>
    );
  }
  const collator = new Intl.Collator(i18n.resolvedLanguage);
  const q = (search.q ?? "").toLowerCase();
  const rows = items.data.filter((i) =>
    shown(i, search.show, q, categoryName(t, i.category).toLowerCase()),
  );
  if (rows.length === 0) return <p className="text-muted-foreground">{t("catalog.none")}</p>;
  const categories = [...new Set(rows.map((i) => i.category))].sort((a, b) =>
    collator.compare(categoryName(t, a), categoryName(t, b)),
  );
  return (
    <div className="space-y-6">
      {categories.map((category) => (
        <section key={category} aria-labelledby={`cat-${category}`}>
          <h2 id={`cat-${category}`} className="mb-2 text-sm font-semibold">
            {categoryName(t, category)}
          </h2>
          <ul className="divide-y overflow-hidden rounded-md border bg-card">
            {rows
              .filter((i) => i.category === category)
              .sort((a, b) => collator.compare(a.name, b.name))
              .map((item) => (
                <ItemRow key={item.id} item={item} selected={item.id === search.item} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ItemRow({ item, selected }: { item: CatalogItem; selected: boolean }) {
  const { t } = useTranslation();
  const rev = item.current_revision;
  return (
    <li className={cn("flex items-center gap-3 px-3 py-2.5", selected && "bg-accent")}>
      <ItemPreview item={rev} className="size-9" />
      <div className="min-w-0 flex-1">
        <Link
          from="/catalog"
          search={(prev) => ({ ...prev, item: item.id, new: undefined })}
          className="font-medium hover:text-primary hover:underline"
        >
          {item.name}
        </Link>
        <div className="text-xs text-muted-foreground tabular-nums">
          {t("catalog.sizeCm", { size: sizeText(rev) })}
        </div>
      </div>
      <FlagBadges rev={rev} builtin={item.builtin} />
    </li>
  );
}
