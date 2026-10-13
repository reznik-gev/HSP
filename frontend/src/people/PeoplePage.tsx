/**
 * People (docs/0088 phase 2): search and filter everyone, open a person in the side panel.
 * Filters and the open person live in the address, so any view can be shared as a link.
 * Admins also create people and edit them; viewers only look.
 */
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Page } from "@/app/Page";
import { AdminOnly } from "@/auth/admin";
import { Button } from "@/components/ui/button";
import { inputClass, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { treeOrder, unitsQuery } from "@/org/units";

import { peopleQuery, type Person } from "./data";
import type { PeopleSearch } from "./search";
import { PersonPanel } from "./PersonPanel";

const route = getRouteApi("/shell/people");

export function PeoplePage() {
  const { t } = useTranslation();
  const search = route.useSearch();
  const navigate = useNavigate({ from: "/people" });
  const set = (change: Partial<PeopleSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });

  return (
    <Page title={t("people.title")}>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={search.q ?? ""} onChange={(q) => set({ q: q || undefined })} />
        <UnitFilter value={search.unit} onChange={(unit) => set({ unit })} />
        <Toggle
          label={t("people.filters.unseated")}
          checked={!!search.unseated}
          onChange={(v) => set({ unseated: v || undefined })}
        />
        <Toggle
          label={t("people.filters.inactive")}
          checked={!!search.inactive}
          onChange={(v) => set({ inactive: v || undefined })}
        />
        <div className="ms-auto">
          <AdminOnly>
            <Button onClick={() => set({ new: true, person: undefined })}>
              <Plus aria-hidden />
              {t("people.new")}
            </Button>
          </AdminOnly>
        </div>
      </div>
      <div className="mt-5">
        <PeopleTable search={search} />
      </div>
      {(search.person ?? search.new) && (
        <PersonPanel
          personId={search.person ?? null}
          onClose={() => set({ person: undefined, new: undefined })}
          onCreated={(id) => set({ person: id, new: undefined })}
        />
      )}
    </Page>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  if (value !== shown) {
    setShown(value);
    if (draft.trim() !== value) setDraft(value);
  }
  return (
    <div className="relative w-72">
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={draft}
        aria-label={t("people.searchLabel")}
        placeholder={t("people.searchPlaceholder")}
        className={cn(inputClass, "ps-9")}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = e.target.value.trim();
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => onChange(next), 300);
        }}
      />
    </div>
  );
}

function UnitFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (unit: string | undefined) => void;
}) {
  const { t, i18n } = useTranslation();
  const units = useQuery(unitsQuery);
  const nodes = units.data
    ? treeOrder(
        units.data.filter((u) => !u.archived_at),
        new Intl.Collator(i18n.resolvedLanguage),
      )
    : [];
  return (
    <Select
      aria-label={t("people.filters.unit")}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="w-56"
    >
      <option value="">{t("people.filters.allTeams")}</option>
      {nodes.map(({ unit, depth }) => (
        <option key={unit.id} value={unit.id}>
          {"  ".repeat(depth) + unit.name}
        </option>
      ))}
    </Select>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--primary)]"
      />
      {label}
    </label>
  );
}

function PeopleTable({ search }: { search: PeopleSearch }) {
  const { t } = useTranslation();
  const filters = {
    q: search.q,
    unit: search.unit,
    inactive: search.inactive,
    unseated: search.unseated,
  };
  const people = useInfiniteQuery(peopleQuery(filters));
  const units = useQuery(unitsQuery);
  const unitName = new Map(units.data?.map((u) => [u.id, u.name]));
  if (people.isPending) return null;
  if (people.isError) {
    return (
      <p role="alert" className="text-destructive">
        {t("people.loadFailed")}
      </p>
    );
  }
  const rows = people.data.pages.flatMap((p) => p.items);
  if (rows.length === 0) return <p className="text-muted-foreground">{t("people.none")}</p>;
  return (
    <div>
      <table className="w-full border-collapse overflow-hidden rounded-md border bg-card text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {(["name", "title", "team", "status"] as const).map((c) => (
              <th key={c} scope="col" className="px-3 py-2 text-start font-normal">
                {t(`people.columns.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              team={p.primary_unit_id ? unitName.get(p.primary_unit_id) : undefined}
              selected={p.id === search.person}
            />
          ))}
        </tbody>
      </table>
      {people.hasNextPage && (
        <Button
          variant="outline"
          className="mt-4"
          disabled={people.isFetchingNextPage}
          onClick={() => void people.fetchNextPage()}
        >
          {t("search.more")}
        </Button>
      )}
    </div>
  );
}

function PersonRow({
  person,
  team,
  selected,
}: {
  person: Person;
  team: string | undefined;
  selected: boolean;
}) {
  const { t } = useTranslation();
  return (
    <tr className={cn("border-b last:border-b-0", selected && "bg-accent")}>
      <th scope="row" className="px-3 py-2.5 text-start font-normal">
        <Link
          from="/people"
          search={(prev) => ({ ...prev, person: person.id, new: undefined })}
          className="font-medium hover:text-primary hover:underline"
        >
          {person.display_name}
        </Link>
        <div className="text-xs text-muted-foreground" dir="ltr">
          {person.email}
        </div>
      </th>
      <td className="px-3 py-2.5">{person.title ?? "–"}</td>
      <td className="px-3 py-2.5">{team ?? "–"}</td>
      <td className="px-3 py-2.5">
        {person.active ? (
          <span className="text-muted-foreground">{t("people.active")}</span>
        ) : (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">{t("people.inactive")}</span>
        )}
      </td>
    </tr>
  );
}
