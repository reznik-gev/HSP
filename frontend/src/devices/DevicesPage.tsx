/**
 * Devices (docs/0095, admins): search by asset tag or serial number, filter by placed and
 * issued, and see where each device is placed, with Show on plan. A device opens in the side
 * panel. Filters and the open device live in the address, like the People page (docs/0088).
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Page } from "@/app/Page";
import { useIsAdmin } from "@/auth/admin";
import { Button } from "@/components/ui/button";
import { inputClass, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

import { type Device, devicesQuery } from "./data";
import { DevicePanel } from "./DevicePanel";
import { PersonName, PlacedAt } from "./parts";
import { asFlag, type DevicesSearch } from "./search";

const route = getRouteApi("/shell/devices");

export function DevicesPage() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const search = route.useSearch();
  const navigate = useNavigate({ from: "/devices" });
  const set = (change: Partial<DevicesSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });

  if (!isAdmin) {
    return (
      <Page title={t("devices.title")}>
        <p className="text-muted-foreground">{t("devices.adminsOnly")}</p>
      </Page>
    );
  }
  return (
    <Page title={t("devices.title")}>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={search.q ?? ""} onChange={(q) => set({ q: q || undefined })} />
        <YesNoFilter
          label={t("devices.filters.placed")}
          value={search.placed}
          options={["devices.filters.placedYes", "devices.filters.placedNo"]}
          onChange={(placed) => set({ placed })}
        />
        <YesNoFilter
          label={t("devices.filters.issued")}
          value={search.issued}
          options={["devices.filters.issuedYes", "devices.filters.issuedNo"]}
          onChange={(issued) => set({ issued })}
        />
        <div className="ms-auto">
          <Button onClick={() => set({ new: true, device: undefined })}>
            <Plus aria-hidden />
            {t("devices.new")}
          </Button>
        </div>
      </div>
      <div className="mt-5">
        <DeviceTable search={search} />
      </div>
      {(search.device ?? search.new) && (
        <DevicePanel
          deviceId={search.device ?? null}
          onClose={() => set({ device: undefined, new: undefined })}
          onOpen={(id) => set({ device: id, new: undefined })}
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
        dir="auto"
        aria-label={t("devices.search")}
        placeholder={t("devices.search")}
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

function YesNoFilter({
  label,
  value,
  options: [yes, no],
  onChange,
}: {
  label: string;
  value: "yes" | "no" | undefined;
  options: [string, string];
  onChange: (v: "yes" | "no" | undefined) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || undefined) as "yes" | "no" | undefined)}
      className="w-44"
    >
      <option value="">{label}</option>
      <option value="yes">{t(yes)}</option>
      <option value="no">{t(no)}</option>
    </Select>
  );
}

function DeviceTable({ search }: { search: DevicesSearch }) {
  const { t } = useTranslation();
  const devices = useInfiniteQuery(
    devicesQuery({ q: search.q, placed: asFlag(search.placed), issued: asFlag(search.issued) }),
  );
  if (devices.isPending) return null;
  if (devices.isError) {
    return (
      <p role="alert" className="text-destructive">
        {t("devices.loadFailed")}
      </p>
    );
  }
  const rows = devices.data.pages.flatMap((p) => p.items);
  if (rows.length === 0) return <p className="text-muted-foreground">{t("devices.none")}</p>;
  return (
    <div>
      <table className="w-full border-collapse overflow-hidden rounded-md border bg-card text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {(["tag", "serial", "issuedTo", "placed"] as const).map((c) => (
              <th key={c} scope="col" className="px-3 py-2 text-start font-normal">
                {t(`devices.columns.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <DeviceRow key={d.id} device={d} selected={d.id === search.device} />
          ))}
        </tbody>
      </table>
      {devices.hasNextPage && (
        <Button
          variant="outline"
          className="mt-4"
          disabled={devices.isFetchingNextPage}
          onClick={() => void devices.fetchNextPage()}
        >
          {t("search.more")}
        </Button>
      )}
    </div>
  );
}

function DeviceRow({ device, selected }: { device: Device; selected: boolean }) {
  const { t } = useTranslation();
  return (
    <tr className={cn("border-b last:border-b-0", selected && "bg-accent")}>
      <th scope="row" className="px-3 py-2.5 text-start font-normal">
        <Link
          from="/devices"
          search={(prev) => ({ ...prev, device: device.id, new: undefined })}
          className="font-medium hover:text-primary hover:underline"
          dir="ltr"
        >
          {device.asset_tag ?? t("devices.noTag")}
        </Link>
      </th>
      <td className="px-3 py-2.5" dir="ltr">
        <span className="block text-start">{device.serial_number ?? "–"}</span>
      </td>
      <td className="px-3 py-2.5">
        {device.assigned_person_id ? <PersonName id={device.assigned_person_id} /> : "–"}
      </td>
      <td className="px-3 py-2.5">
        <PlacedAt device={device} />
      </td>
    </tr>
  );
}
