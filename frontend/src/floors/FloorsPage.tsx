/**
 * Floors: every site, its buildings and their floors, with seat counts (docs/0085, docs/0087).
 * One occupancy request per site returns the whole tree with counts.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { EmptyState, Page } from "@/app/Page";
import { AdminOnly, useIsAdmin } from "@/auth/admin";
import { Button } from "@/components/ui/button";

import { type LocationEdit, LocationMenu, LocationSheet, useArchive } from "./LocationAdmin";

type Site = components["schemas"]["SiteOut"];
type SiteOccupancy = components["schemas"]["SiteOccupancy"];
type BuildingOccupancy = components["schemas"]["BuildingOccupancy"];
type Counts = components["schemas"]["Counts"];

export const sitesQuery = queryOptions({
  queryKey: ["sites"],
  queryFn: async (): Promise<Site[]> => {
    const { data, error } = await api.GET("/api/v1/sites", { params: { query: { limit: 500 } } });
    if (error || !data) throw new Error("Couldn't load sites");
    return data.items;
  },
});

const siteOccupancyQuery = (siteId: string) =>
  queryOptions({
    queryKey: ["occupancy", "site", siteId],
    queryFn: async (): Promise<SiteOccupancy> => {
      const { data, error } = await api.GET("/api/v1/occupancy/sites/{site_id}", {
        params: { path: { site_id: siteId } },
      });
      if (error || !data) throw new Error("Couldn't load occupancy");
      return data;
    },
  });

export function FloorsPage() {
  const { t } = useTranslation();
  const sites = useQuery(sitesQuery);
  const [edit, setEdit] = useState<LocationEdit | null>(null);
  return (
    <Page title={t("floors.title")}>
      <AdminOnly>
        <div className="-mt-2 mb-6 flex justify-end">
          <Button onClick={() => setEdit({ kind: "site" })}>
            <Plus aria-hidden />
            {t("locations.newTitle.site")}
          </Button>
        </div>
      </AdminOnly>
      {sites.isPending ? null : sites.isError ? (
        <p role="alert" className="text-destructive">
          {t("floors.loadFailed")}
        </p>
      ) : sites.data.length === 0 ? (
        <EmptyState>{t("floors.noSites")}</EmptyState>
      ) : (
        <div className="space-y-10">
          {sites.data.map((site) => (
            <SiteSection key={site.id} site={site} onEdit={setEdit} />
          ))}
        </div>
      )}
      {edit && <LocationSheet edit={edit} onClose={() => setEdit(null)} />}
    </Page>
  );
}

function SiteSection({ site, onEdit }: { site: Site; onEdit: (e: LocationEdit) => void }) {
  const { t } = useTranslation();
  const occupancy = useQuery(siteOccupancyQuery(site.id));
  const archive = useArchive();
  return (
    <section aria-labelledby={`site-${site.id}`}>
      <div className="flex items-baseline justify-between gap-4 border-b pb-2">
        <h2 id={`site-${site.id}`} className="text-xl font-semibold tracking-tight">
          {site.name}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground" dir="ltr">
            {site.time_zone}
          </span>
          <AdminOnly>
            <LocationMenu
              label={site.name}
              onEdit={() => onEdit({ kind: "site", item: site })}
              onAdd={() => onEdit({ kind: "building", siteId: site.id })}
              addLabel={t("locations.newTitle.building")}
              onArchive={() => archive.mutate({ kind: "site", id: site.id, name: site.name })}
            />
          </AdminOnly>
        </div>
      </div>
      {occupancy.isError && (
        <p role="alert" className="mt-4 text-destructive">
          {t("floors.loadFailed")}
        </p>
      )}
      {occupancy.data?.buildings.length === 0 && (
        <p className="mt-4 text-muted-foreground">{t("floors.noBuildings")}</p>
      )}
      <div className="mt-5 space-y-7">
        {occupancy.data?.buildings.map((b) => (
          <BuildingFloors key={b.id} building={b} siteId={site.id} onEdit={onEdit} />
        ))}
      </div>
    </section>
  );
}

function BuildingFloors({
  building,
  siteId,
  onEdit,
}: {
  building: BuildingOccupancy;
  siteId: string;
  onEdit: (e: LocationEdit) => void;
}) {
  const { t, i18n } = useTranslation();
  const isAdmin = useIsAdmin();
  const archive = useArchive();
  const n = new Intl.NumberFormat(i18n.resolvedLanguage);
  const columns = ["seats", "taken", "free", "bookable", "unavailable"] as const;
  return (
    <div>
      <div className="flex items-center gap-2">
        <h3 className="flex items-baseline gap-2 text-base font-medium">
          {building.name}
          <span className="text-sm font-normal text-muted-foreground">
            {t("floors.buildingCode", { code: building.code })}
          </span>
        </h3>
        {isAdmin && (
          <LocationMenu
            label={building.name}
            onEdit={() =>
              onEdit({
                kind: "building",
                siteId,
                item: { id: building.id, name: building.name, code: building.code },
              })
            }
            onAdd={() => onEdit({ kind: "floor", buildingId: building.id })}
            addLabel={t("locations.newTitle.floor")}
            onArchive={() =>
              archive.mutate({ kind: "building", id: building.id, name: building.name })
            }
          />
        )}
      </div>
      {building.floors.length === 0 ? (
        <p className="mt-2 text-muted-foreground">{t("floors.noFloors")}</p>
      ) : (
        <table className="tabular mt-2 w-full border-collapse overflow-hidden rounded-md border bg-card text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-2 text-start font-normal">
                {t("floors.columns.floor")}
              </th>
              <th scope="col" className="px-3 py-2 text-end font-normal">
                {t("floors.columns.level")}
              </th>
              {columns.map((c) => (
                <th key={c} scope="col" className="px-3 py-2 text-end font-normal">
                  {t(`floors.columns.${c}`)}
                </th>
              ))}
              <th scope="col" className="w-40 px-3 py-2 text-start font-normal">
                {t("floors.columns.occupancy")}
              </th>
              {isAdmin && (
                <th scope="col" className="w-12">
                  <span className="sr-only">{t("search.columns.actions")}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {building.floors.map((f) => {
              const c = summarize(f.counts);
              return (
                <tr key={f.id} className="border-b last:border-b-0">
                  <th scope="row" className="px-3 py-2.5 text-start font-medium">
                    <Link
                      to="/floors/$floorId"
                      params={{ floorId: f.id }}
                      className="hover:text-primary hover:underline"
                    >
                      {f.name}
                    </Link>
                  </th>
                  <td className="px-3 py-2.5 text-end text-muted-foreground">
                    {n.format(f.level_index)}
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="px-3 py-2.5 text-end">
                      {n.format(c[col])}
                    </td>
                  ))}
                  <td className="px-3 py-2.5">
                    <OccupancyBar taken={c.taken} assignable={c.taken + c.free} />
                  </td>
                  {isAdmin && (
                    <td className="px-1">
                      <LocationMenu
                        label={f.name}
                        onEdit={() =>
                          onEdit({
                            kind: "floor",
                            buildingId: building.id,
                            item: { id: f.id, name: f.name, level_index: f.level_index },
                          })
                        }
                        onArchive={() => archive.mutate({ kind: "floor", id: f.id, name: f.name })}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** "Taken" = held by a person or reserved for a unit (docs/0031). */
export function summarize(c: Counts) {
  return {
    seats: c.total,
    taken: c.assigned_to_people + c.reserved_for_units,
    free: c.free,
    bookable: c.bookable,
    unavailable: c.unavailable,
  };
}

function OccupancyBar({ taken, assignable }: { taken: number; assignable: number }) {
  const { t, i18n } = useTranslation();
  if (assignable === 0) return <span className="text-muted-foreground">–</span>;
  const share = taken / assignable;
  const percent = new Intl.NumberFormat(i18n.resolvedLanguage, { style: "percent" }).format(share);
  return (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={t("floors.occupancyLabel", { taken, total: assignable })}
    >
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${share * 100}%` }} />
      </div>
      <span className="w-10 text-end text-xs text-muted-foreground">{percent}</span>
    </div>
  );
}
