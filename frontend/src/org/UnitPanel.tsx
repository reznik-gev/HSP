/**
 * One team in the side panel (docs/0084, docs/0088): details, positions and members. Admins
 * create teams, rename and move them (never under their own sub-team), manage positions and
 * archive teams. Archiving takes the sub-teams along, moves members up to the parent team and
 * frees seats reserved for the archived teams (docs/0086); the notice offers Undo. Each section
 * lives in its own file under ./panel.
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
  SheetSection,
  SheetTitle,
} from "@/components/ui/sheet";

import { ArchiveButton } from "./panel/ArchiveButton";
import { Members } from "./panel/Members";
import { Positions } from "./panel/Positions";
import { UnitForm } from "./panel/UnitForm";
import { unitsQuery } from "./units";

export function UnitPanel({
  unitId,
  onClose,
  onCreated,
  onArchived,
}: {
  unitId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
  onArchived: () => void;
}) {
  const { t } = useTranslation();
  const units = useQuery(unitsQuery);
  const unit = unitId ? units.data?.find((u) => u.id === unitId) : undefined;
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{unitId ? (unit?.name ?? " ") : t("org.new")}</SheetTitle>
          {unit?.level_label && <SheetDescription>{unit.level_label}</SheetDescription>}
        </SheetHeader>
        {!unitId ? (
          <SheetBody>
            <UnitForm unit={null} onSaved={(u) => onCreated(u.id)} />
          </SheetBody>
        ) : unit ? (
          <>
            <SheetBody>
              <AdminOnly>
                <SheetSection title={t("org.details")}>
                  <UnitForm key={unit.id} unit={unit} />
                </SheetSection>
              </AdminOnly>
              <Positions unitId={unit.id} />
              <Members unitId={unit.id} />
            </SheetBody>
            {unit.parent_id && (
              <AdminOnly>
                <SheetFooter>
                  <ArchiveButton unit={unit} onArchived={onArchived} />
                </SheetFooter>
              </AdminOnly>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
