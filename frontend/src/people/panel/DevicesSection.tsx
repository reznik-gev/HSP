/** The devices issued to a person, and the floor each one is placed on. */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { SheetSection } from "@/components/ui/sheet";

import { personDevicesQuery } from "../data";

export function DevicesSection({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const devices = useQuery(personDevicesQuery(personId));
  return (
    <SheetSection title={t("people.devices")}>
      {devices.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("people.noDevices")}</p>
      )}
      <ul className="space-y-2 text-sm">
        {devices.data?.map((d) => (
          <li key={d.id}>
            <div className="font-medium" dir="ltr">
              {d.asset_tag ?? d.serial_number ?? "–"}
            </div>
            <div className="text-xs text-muted-foreground">
              {d.placement ? d.placement.floor_name : t("people.notPlaced")}
            </div>
          </li>
        ))}
      </ul>
    </SheetSection>
  );
}
