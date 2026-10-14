/**
 * Deactivates or reactivates a person. Deactivating frees their seats (docs/0085); its notice
 * offers Undo, which gives back the seats that are still free.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { notify, notifyError } from "@/lib/notify";

import { type Person, undoDeactivation } from "../data";

export function ActiveToggle({ person }: { person: Person }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["people"] });
    void client.invalidateQueries({ queryKey: ["person", person.id] });
    void client.invalidateQueries({ queryKey: ["seats"] });
    void client.invalidateQueries({ queryKey: ["seat-search"] });
  };
  const deactivate = useMutation({
    mutationFn: async () => {
      const { data } = await api.DELETE("/api/v1/people/{person_id}", {
        params: { path: { person_id: person.id } },
      });
      if (!data) throw new Error();
      return data;
    },
    onSuccess: ({ freed_seats }) => {
      refresh();
      notify(t("people.deactivated", { name: person.display_name }), {
        description: freed_seats.length
          ? t("people.seatsFreed", { count: freed_seats.length })
          : undefined,
        undo: async () => {
          const { skipped } = await undoDeactivation(person.id, freed_seats);
          refresh();
          notify(
            t("people.reactivated", { name: person.display_name }),
            skipped ? { description: t("people.seatsTaken", { count: skipped }) } : {},
          );
        },
      });
    },
    onError: () => notifyError(t("common.failed")),
  });
  const reactivate = useMutation({
    mutationFn: async () => {
      const { data } = await api.POST("/api/v1/people/{person_id}/reactivate", {
        params: { path: { person_id: person.id } },
      });
      if (!data) throw new Error();
    },
    onSuccess: () => {
      refresh();
      notify(t("people.reactivated", { name: person.display_name }));
    },
    onError: () => notifyError(t("common.failed")),
  });
  return person.active ? (
    <Button variant="outline" disabled={deactivate.isPending} onClick={() => deactivate.mutate()}>
      {t("people.deactivate")}
    </Button>
  ) : (
    <Button variant="outline" disabled={reactivate.isPending} onClick={() => reactivate.mutate()}>
      {t("people.reactivate")}
    </Button>
  );
}
