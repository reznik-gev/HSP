/**
 * One person in the side panel (docs/0088 choices 5, 6, 10): details, teams, seats and devices.
 * Admins edit details and teams, create people, and deactivate or reactivate them;
 * deactivating frees their seats (docs/0085) and offers Undo, which gives back the seats that
 * are still free. Each section lives in its own file under ./panel.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AdminOnly } from "@/auth/admin";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { personQuery } from "./data";
import { ActiveToggle } from "./panel/ActiveToggle";
import { DetailsForm, DetailsSection } from "./panel/DetailsSection";
import { DevicesSection } from "./panel/DevicesSection";
import { SeatsSection } from "./panel/SeatsSection";
import { TeamsSection } from "./panel/TeamsSection";

export function PersonPanel({
  personId,
  onClose,
  onCreated,
}: {
  personId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const person = useQuery({ ...personQuery(personId ?? ""), enabled: !!personId });
  const title = personId ? (person.data?.display_name ?? " ") : t("people.new");
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {person.data && (
            <SheetDescription>
              <bdi>{person.data.email}</bdi>
            </SheetDescription>
          )}
        </SheetHeader>
        {!personId ? (
          <SheetBody>
            <DetailsForm person={null} onSaved={(p) => onCreated(p.id)} />
          </SheetBody>
        ) : person.isError ? (
          <SheetBody>
            <p role="alert" className="text-destructive">
              {t("people.loadFailed")}
            </p>
          </SheetBody>
        ) : person.data ? (
          <>
            <SheetBody>
              {!person.data.active && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">{t("people.isInactive")}</p>
              )}
              <DetailsSection person={person.data} />
              <TeamsSection person={person.data} />
              <SeatsSection personId={person.data.id} />
              <DevicesSection personId={person.data.id} />
            </SheetBody>
            <AdminOnly>
              <SheetFooter>
                <ActiveToggle person={person.data} />
              </SheetFooter>
            </AdminOnly>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
