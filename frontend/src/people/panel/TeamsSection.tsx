/** A person's teams: the editor for admins, a plain list (primary team marked) for others. */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useIsAdmin } from "@/auth/admin";
import { SheetSection } from "@/components/ui/sheet";
import { unitsQuery } from "@/org/units";

import type { Person } from "../data";
import { TeamsEditor } from "./TeamsEditor";

export function TeamsSection({ person }: { person: Person }) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const units = useQuery(unitsQuery);
  const name = new Map(units.data?.map((u) => [u.id, u.name]));
  if (isAdmin) {
    return (
      <SheetSection title={t("people.teams")}>
        <TeamsEditor key={JSON.stringify(person.memberships)} person={person} />
      </SheetSection>
    );
  }
  return (
    <SheetSection title={t("people.teams")}>
      {person.memberships.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("people.noTeams")}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {person.memberships.map((m) => (
            <li key={m.unit_id}>
              {name.get(m.unit_id) ?? "…"}
              {m.is_primary && (
                <span className="ms-2 text-xs text-muted-foreground">{t("people.primary")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </SheetSection>
  );
}
