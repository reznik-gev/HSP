/** Small pieces the Devices list and panel share: a person's name and where a device is. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

import { personQuery } from "@/people/data";

import type { Device } from "./data";

/** A person's name, loaded once and shared through the query cache. */
export function PersonName({ id }: { id: string }) {
  const person = useQuery(personQuery(id));
  return <>{person.data?.display_name ?? "…"}</>;
}

/** The floor a device is placed on, with Show on plan; "–" when it isn't placed. */
export function PlacedAt({ device }: { device: Device }) {
  const { t } = useTranslation();
  const at = device.placement;
  if (!at) return <>–</>;
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      {at.floor_name}
      <Link
        to="/floors/$floorId"
        params={{ floorId: at.floor_id }}
        search={{ seat: at.element_id }}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <MapPin className="size-3.5" aria-hidden />
        {t("devices.showOnPlan")}
      </Link>
    </span>
  );
}
