/**
 * Assigning seats on the plan (docs/0085, docs/0088 choice 4): admins give a seat to a person or
 * reserve it for a team, change who has it, or free it. Reassigning a taken seat moves the
 * previous holder off (docs/0086), and the notice says who, with Undo, which puts things back
 * only if nobody else took the seat meanwhile.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { ApiProblem, asProblem, problemMessage, problemSlug } from "@/api/problems";
import { Button } from "@/components/ui/button";
import { notify, notifyError } from "@/lib/notify";

import { type Holder, HolderPicker } from "./HolderPicker";

interface Previous {
  person_id?: string | null;
  unit_id?: string | null;
  name: string;
}

/** Put a seat back to what it was, unless someone else holds it now. */
async function restore(seatId: string, expectHolder: Holder | null, previous: Previous | null) {
  const { data } = await api.GET("/api/v1/seats/{seat_id}/assignment", {
    params: { path: { seat_id: seatId } },
  });
  const now = data?.assignment;
  const nowId = now?.holder_person_id ?? now?.holder_unit_id ?? null;
  if (nowId !== (expectHolder?.id ?? null)) return false; // changed meanwhile: leave it alone
  if (previous) {
    await api.PUT("/api/v1/seats/{seat_id}/assignment", {
      params: { path: { seat_id: seatId } },
      body: previous.person_id ? { person_id: previous.person_id } : { unit_id: previous.unit_id },
    });
  } else {
    await api.DELETE("/api/v1/seats/{seat_id}/assignment", {
      params: { path: { seat_id: seatId } },
    });
  }
  return true;
}

export function SeatActions({
  seatId,
  label,
  current,
}: {
  seatId: string;
  label: string;
  /** Who holds it now, if anyone. */
  current: Previous | null;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [choosing, setChoosing] = useState(false);
  const refresh = () => {
    for (const key of [["seats"], ["seat-search"], ["people"], ["occupancy"]]) {
      void client.invalidateQueries({ queryKey: key });
    }
  };
  const undone = (ok: boolean) => {
    refresh();
    notify(ok ? t("assign.undone", { seat: label }) : t("assign.undoSkipped", { seat: label }));
  };

  const assign = useMutation({
    mutationFn: async (holder: Holder) => {
      const { data, error } = await api.PUT("/api/v1/seats/{seat_id}/assignment", {
        params: { path: { seat_id: seatId } },
        body: holder.kind === "person" ? { person_id: holder.id } : { unit_id: holder.id },
      });
      if (error || !data) throw new ApiProblem(asProblem(error));
      return holder;
    },
    onSuccess: (holder) => {
      setChoosing(false);
      refresh();
      const before = current;
      notify(
        t(holder.kind === "person" ? "assign.assigned" : "assign.reserved", {
          seat: label,
          name: holder.name,
        }),
        {
          description: before ? t("assign.movedOff", { name: before.name }) : undefined,
          undo: async () => undone(await restore(seatId, holder, before)),
        },
      );
    },
    onError: (e) => {
      const problem = asProblem(e);
      notifyError(
        problemSlug(problem) === "holder-inactive"
          ? t("assign.inactive")
          : problemMessage(problem, t("common.failed")),
      );
    },
  });

  const unassign = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE("/api/v1/seats/{seat_id}/assignment", {
        params: { path: { seat_id: seatId } },
      });
      if (error) throw new ApiProblem(asProblem(error));
    },
    onSuccess: () => {
      refresh();
      const before = current;
      notify(t("assign.freed", { seat: label }), {
        description: before ? t("assign.movedOff", { name: before.name }) : undefined,
        undo: async () => undone(await restore(seatId, null, before)),
      });
    },
    onError: () => notifyError(t("common.failed")),
  });

  return (
    <div className="space-y-3 border-t px-5 py-4">
      {choosing ? (
        <>
          <HolderPicker onPick={(h) => assign.mutate(h)} />
          <Button variant="ghost" size="sm" onClick={() => setChoosing(false)}>
            {t("common.cancel")}
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setChoosing(true)} disabled={assign.isPending}>
            {current ? t("assign.change") : t("assign.assign")}
          </Button>
          {current && (
            <Button
              size="sm"
              variant="outline"
              disabled={unassign.isPending}
              onClick={() => unassign.mutate()}
            >
              {t("assign.unassign")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
