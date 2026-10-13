/**
 * Teams (docs/0006, docs/0088 choice 3): the org tree, to browse and (for admins) manage.
 * Expand and collapse; each team shows how many active people are directly in it. The open team
 * lives in the address (?unit=), so a team can be shared as a link.
 */
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Page } from "@/app/Page";
import { AdminOnly } from "@/auth/admin";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { memberCountsQuery } from "./members";
import { OrgChart } from "./OrgChart";
import type { OrgSearch } from "./search";
import { UnitPanel } from "./UnitPanel";
import { type Unit, unitsQuery } from "./units";

const route = getRouteApi("/shell/org");

export function OrgPage() {
  const { t } = useTranslation();
  const search = route.useSearch();
  const navigate = useNavigate({ from: "/org" });
  const set = (change: Partial<OrgSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });
  const units = useQuery(unitsQuery);

  return (
    <Page title={t("org.title")}>
      <div className="flex items-center justify-between">
        <div role="group" aria-label={t("org.view")} className="flex rounded-md border p-0.5">
          {(["tree", "chart"] as const).map((v) => {
            const on = (search.view ?? "tree") === v;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                onClick={() => set({ view: v === "chart" ? "chart" : undefined })}
                className={cn(
                  "rounded px-3 py-1 text-sm",
                  on ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground",
                )}
              >
                {t(`org.views.${v}`)}
              </button>
            );
          })}
        </div>
        <AdminOnly>
          <Button onClick={() => set({ new: true, unit: undefined })}>
            <Plus aria-hidden />
            {t("org.new")}
          </Button>
        </AdminOnly>
      </div>
      <div className="mt-4">
        {units.isError ? (
          <p role="alert" className="text-destructive">
            {t("org.loadFailed")}
          </p>
        ) : units.data?.length === 0 ? (
          <p className="text-muted-foreground">{t("org.empty")}</p>
        ) : units.data && search.view === "chart" ? (
          <OrgChart units={units.data.filter((u) => !u.archived_at)} selected={search.unit} />
        ) : units.data ? (
          <Tree units={units.data.filter((u) => !u.archived_at)} selected={search.unit} />
        ) : null}
      </div>
      {(search.unit ?? search.new) && (
        <UnitPanel
          unitId={search.unit ?? null}
          onClose={() => set({ unit: undefined, new: undefined })}
          onCreated={(id) => set({ unit: id, new: undefined })}
          onArchived={() => set({ unit: undefined })}
        />
      )}
    </Page>
  );
}

function Tree({ units, selected }: { units: Unit[]; selected: string | undefined }) {
  const { t, i18n } = useTranslation();
  const counts = useQuery(memberCountsQuery);
  const collator = new Intl.Collator(i18n.resolvedLanguage);
  const children = new Map<string | null, Unit[]>();
  for (const u of units) {
    const list = children.get(u.parent_id) ?? [];
    list.push(u);
    children.set(u.parent_id, list);
  }
  for (const list of children.values()) list.sort((a, b) => collator.compare(a.name, b.name));
  // Start with the root and its direct teams open.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set((children.get(null) ?? []).map((u) => u.id)),
  );
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows = (parent: string | null, depth: number): React.ReactNode[] =>
    (children.get(parent) ?? []).flatMap((u) => {
      const kids = children.get(u.id) ?? [];
      const expanded = open.has(u.id);
      const count = counts.data?.get(u.id) ?? 0;
      return [
        <li
          key={u.id}
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={kids.length ? expanded : undefined}
          aria-selected={u.id === selected}
          className={cn(
            "flex h-10 items-center gap-1 border-b px-2 last:border-b-0",
            u.id === selected && "bg-accent",
          )}
          style={{ paddingInlineStart: `${0.5 + depth * 1.5}rem` }}
        >
          {kids.length ? (
            <button
              type="button"
              onClick={() => toggle(u.id)}
              aria-label={t(expanded ? "org.collapse" : "org.expand", { name: u.name })}
              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted"
            >
              <ChevronRight
                className={cn(
                  "size-4 transition-transform rtl:-scale-x-100",
                  expanded && "rotate-90 rtl:rotate-90",
                )}
                aria-hidden
              />
            </button>
          ) : (
            <span className="size-6" aria-hidden />
          )}
          <Link
            from="/org"
            search={(prev) => ({ ...prev, unit: u.id, new: undefined })}
            className="font-medium hover:text-primary hover:underline"
          >
            {u.name}
          </Link>
          {u.level_label && (
            <span className="ms-2 text-xs text-muted-foreground">{u.level_label}</span>
          )}
          <span className="tabular ms-auto text-xs text-muted-foreground">
            {t("org.members", { count })}
          </span>
        </li>,
        ...(expanded ? rows(u.id, depth + 1) : []),
      ];
    });

  return (
    <ul role="tree" aria-label={t("org.title")} className="rounded-md border bg-card text-sm">
      {rows(null, 0)}
    </ul>
  );
}
