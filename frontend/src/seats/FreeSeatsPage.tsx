/**
 * Free seats (docs/0108): the seats nobody holds that can be assigned or booked, narrowed by
 * site, building, floor and zone, and by whether they're bookable. The filters live in the
 * address, so a list can be shared as a link; each row has "Show on plan".
 */
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { EmptyState, Page } from "@/app/Page";
import { Button } from "@/components/ui/button";
import { sitesQuery } from "@/floors/FloorsPage";
import { floorPlaceQuery, publishedPlanQuery } from "@/floors/planData";

import { SeatRow } from "./SeatsPage";

const route = getRouteApi("/shell/seats/free");

const PAGE_SIZE = 50;

/** Which free seats: either kind, assignable ones, or bookable ones. */
export type FreeKind = "any" | "assignable" | "bookable";
const STATUS = { any: "available", assignable: "free", bookable: "bookable" } as const;

export interface FreeSeatsSearch {
  site?: string;
  building?: string;
  floor?: string;
  zone?: string;
  kind?: Exclude<FreeKind, "any">;
}

export function validateFreeSeatsSearch(s: Record<string, unknown>): FreeSeatsSearch {
  const id = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const kind = s.kind === "assignable" || s.kind === "bookable" ? s.kind : undefined;
  const out: FreeSeatsSearch = {
    site: id(s.site),
    building: id(s.building),
    floor: id(s.floor),
    zone: id(s.zone),
    kind,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

const freeSeatsQuery = (f: FreeSeatsSearch) =>
  infiniteQueryOptions({
    queryKey: ["free-seats", f],
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.GET("/api/v1/seats", {
        params: {
          query: {
            status: STATUS[f.kind ?? "any"],
            site_id: f.site,
            building_id: f.building,
            floor_id: f.floor,
            zone_id: f.zone,
            limit: PAGE_SIZE,
            cursor: pageParam,
          },
        },
      });
      if (error || !data) throw new Error("Couldn't load free seats");
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

const buildingsQuery = (siteId: string) =>
  queryOptions({
    queryKey: ["buildings", siteId],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/buildings", {
        params: { query: { site_id: siteId, limit: 500 } },
      });
      if (error || !data) throw new Error("Couldn't load buildings");
      return data.items;
    },
  });

const floorsQuery = (buildingId: string) =>
  queryOptions({
    queryKey: ["floors", buildingId],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/floors", {
        params: { query: { building_id: buildingId, limit: 500 } },
      });
      if (error || !data) throw new Error("Couldn't load floors");
      return data.items;
    },
  });

export function FreeSeatsPage() {
  const { t } = useTranslation();
  const filters = route.useSearch();
  const navigate = useNavigate();
  /** Changing a place clears the narrower ones under it. */
  const set = (change: FreeSeatsSearch) =>
    void navigate({
      to: "/seats/free",
      search: validateFreeSeatsSearch({ ...filters, ...change }),
      replace: true,
    });

  return (
    <Page title={t("freeSeats.title")}>
      <div className="-mt-2 mb-6 flex flex-wrap items-end gap-3">
        <Filters filters={filters} set={set} />
        <Button asChild variant="ghost" size="sm" className="ms-auto">
          <Link to="/seats">
            <Search aria-hidden />
            {t("freeSeats.search")}
          </Link>
        </Button>
      </div>
      <Results filters={filters} />
    </Page>
  );
}

function Filters({
  filters,
  set,
}: {
  filters: FreeSeatsSearch;
  set: (change: FreeSeatsSearch) => void;
}) {
  const { t } = useTranslation();
  const sites = useQuery(sitesQuery);
  const buildings = useQuery({ ...buildingsQuery(filters.site ?? ""), enabled: !!filters.site });
  const floors = useQuery({ ...floorsQuery(filters.building ?? ""), enabled: !!filters.building });
  const place = useQuery({ ...floorPlaceQuery(filters.floor ?? ""), enabled: !!filters.floor });
  const version = place.data?.floor.published_version ?? 0;
  const plan = useQuery({
    ...publishedPlanQuery(filters.floor ?? "", version),
    enabled: !!filters.floor && version > 0,
  });
  const none = t("freeSeats.all");
  return (
    <>
      <Choice
        label={t("freeSeats.site")}
        value={filters.site}
        options={(sites.data ?? []).map((s) => [s.id, s.name])}
        none={none}
        onChange={(site) => set({ site, building: undefined, floor: undefined, zone: undefined })}
      />
      <Choice
        label={t("freeSeats.building")}
        value={filters.building}
        options={(buildings.data ?? []).map((b) => [b.id, b.name])}
        none={none}
        disabled={!filters.site}
        onChange={(building) => set({ building, floor: undefined, zone: undefined })}
      />
      <Choice
        label={t("freeSeats.floor")}
        value={filters.floor}
        options={(floors.data ?? []).map((f) => [f.id, f.name])}
        none={none}
        disabled={!filters.building}
        onChange={(floor) => set({ floor, zone: undefined })}
      />
      <Choice
        label={t("freeSeats.zone")}
        value={filters.zone}
        options={(plan.data?.zones ?? []).map((z) => [z.id, z.name])}
        none={none}
        disabled={!filters.floor}
        onChange={(zone) => set({ zone })}
      />
      <Choice
        label={t("freeSeats.kind")}
        value={filters.kind}
        options={[
          ["assignable", t("freeSeats.kinds.assignable")],
          ["bookable", t("freeSeats.kinds.bookable")],
        ]}
        none={t("freeSeats.kinds.any")}
        onChange={(kind) => set({ kind: kind as FreeSeatsSearch["kind"] })}
      />
    </>
  );
}

function Choice({
  label,
  value,
  options,
  none,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: [string, string][];
  none: string;
  disabled?: boolean;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-9 min-w-36 rounded-md border border-input bg-card px-2 text-sm text-foreground disabled:opacity-50"
      >
        <option value="">{none}</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Results({ filters }: { filters: FreeSeatsSearch }) {
  const { t } = useTranslation();
  const seats = useInfiniteQuery(freeSeatsQuery(filters));
  if (seats.isPending) return null;
  if (seats.isError) {
    return (
      <p role="alert" className="text-destructive">
        {t("freeSeats.failed")}
      </p>
    );
  }
  const rows = seats.data.pages.flatMap((p) => p.items);
  if (rows.length === 0) return <EmptyState>{t("freeSeats.none")}</EmptyState>;
  return (
    <div>
      <table className="w-full border-collapse overflow-hidden rounded-md border bg-card text-sm">
        <caption className="sr-only">{t("freeSeats.title")}</caption>
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {(["seat", "holder", "team", "location"] as const).map((c) => (
              <th key={c} scope="col" className="px-3 py-2 text-start font-normal">
                {t(`search.columns.${c}`)}
              </th>
            ))}
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">{t("search.columns.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <SeatRow key={s.id} seat={s} />
          ))}
        </tbody>
      </table>
      {seats.hasNextPage && (
        <Button
          variant="outline"
          className="mt-4"
          disabled={seats.isFetchingNextPage}
          onClick={() => void seats.fetchNextPage()}
        >
          {t("search.more")}
        </Button>
      )}
    </div>
  );
}
