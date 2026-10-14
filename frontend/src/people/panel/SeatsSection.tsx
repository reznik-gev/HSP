/** The seats a person holds, each with a link to it on the floor plan. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { SheetSection } from "@/components/ui/sheet";

import { personSeatsQuery } from "../data";

export function SeatsSection({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const seats = useQuery(personSeatsQuery(personId));
  return (
    <SheetSection title={t("people.seats")}>
      {seats.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("people.noSeats")}</p>
      )}
      <ul className="space-y-2">
        {seats.data?.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
            <div>
              <div className="font-medium">{s.label ?? t("plan.unlabelled")}</div>
              <div className="text-xs text-muted-foreground">
                {s.building.name} › {s.floor.name}
              </div>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/floors/$floorId" params={{ floorId: s.floor.id }} search={{ seat: s.id }}>
                <MapPin aria-hidden />
                {t("search.showOnPlan")}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </SheetSection>
  );
}
