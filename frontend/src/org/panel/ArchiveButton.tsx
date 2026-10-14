/**
 * Archives a team with its sub-teams, moving members up and freeing reserved seats
 * (docs/0086). The notice offers Undo, which gives back the seats that are still free.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { ApiProblem, asProblem, problemMessage } from "@/api/problems";
import { Button } from "@/components/ui/button";
import { notify, notifyError } from "@/lib/notify";

import { undoUnitArchive } from "../undo";
import type { Unit } from "../units";

export function ArchiveButton({ unit, onArchived }: { unit: Unit; onArchived: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const refresh = () => {
    for (const key of [["org-units"], ["people"], ["person"], ["seats"], ["seat-search"]]) {
      void client.invalidateQueries({ queryKey: key });
    }
  };
  const archive = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.DELETE("/api/v1/org-units/{unit_id}", {
        params: { path: { unit_id: unit.id } },
      });
      if (error || !data) throw new ApiProblem(asProblem(error));
      return data;
    },
    onSuccess: (report) => {
      refresh();
      onArchived();
      const parts = [
        report.archived.length > 1 && t("org.alsoArchived", { count: report.archived.length - 1 }),
        report.moved_members.length > 0 &&
          t("org.membersMoved", { count: report.moved_members.length }),
        report.freed_seats.length > 0 &&
          t("people.seatsFreed", { count: report.freed_seats.length }),
      ].filter(Boolean);
      notify(t("org.archived", { name: unit.name }), {
        description: parts.join(" · ") || undefined,
        undo: async () => {
          const { skippedSeats } = await undoUnitArchive(report);
          refresh();
          notify(
            t("org.restored", { name: unit.name }),
            skippedSeats ? { description: t("people.seatsTaken", { count: skippedSeats }) } : {},
          );
        },
      });
    },
    onError: (e) => notifyError(problemMessage(asProblem(e), t("common.failed"))),
  });
  return (
    <Button variant="outline" disabled={archive.isPending} onClick={() => archive.mutate()}>
      {t("org.archive")}
    </Button>
  );
}
