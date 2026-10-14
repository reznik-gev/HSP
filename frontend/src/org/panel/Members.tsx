/** The people directly in a team, each linking to their person panel. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { SheetSection } from "@/components/ui/sheet";

export function Members({ unitId }: { unitId: string }) {
  const { t } = useTranslation();
  const members = useQuery({
    queryKey: ["people", { unit: unitId, panel: true }],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/people", {
        params: { query: { unit_id: unitId, limit: 200 } },
      });
      if (!data) throw new Error("Couldn't load members");
      return data.items;
    },
  });
  return (
    <SheetSection title={t("org.membersTitle")}>
      {members.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("org.noMembers")}</p>
      )}
      <ul className="space-y-1.5 text-sm">
        {members.data?.map((p) => {
          const m = p.memberships.find((x) => x.unit_id === unitId);
          return (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <Link
                to="/people"
                search={{ person: p.id }}
                className="hover:text-primary hover:underline"
              >
                {p.display_name}
              </Link>
              {m?.is_primary === false && (
                <span className="text-xs text-muted-foreground">{t("org.secondary")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </SheetSection>
  );
}
