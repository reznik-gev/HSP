/**
 * Publishing the draft (docs/0082, docs/0089): what changed since the published version, which
 * assigned seats the change frees (that happens automatically, docs/0086, so there's nothing
 * else to confirm), and an optional note. Seat-label and device conflicts go to Problems.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { ApiProblem, asProblem, type Problem } from "@/api/problems";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { ApiPlan, Kind } from "@/editor/core/operations";
import { floorSeatsQuery } from "@/floors/planData";

type PlanDiff = components["schemas"]["PlanDiff"];
type PublishResult = components["schemas"]["PublishResult"];

const KINDS: { kind: Kind; list: "walls" | "openings" | "columns" | "zones" | "objects" }[] = [
  { kind: "wall", list: "walls" },
  { kind: "opening", list: "openings" },
  { kind: "column", list: "columns" },
  { kind: "zone", list: "zones" },
  { kind: "object", list: "objects" },
];

type Counts = Record<"added" | "changed" | "removed", { kind: Kind; count: number }[]>;

function countsFromDiff(diff: PlanDiff): Counts {
  const pick = (what: "added" | "changed" | "removed") =>
    KINDS.map(({ kind, list }) => ({ kind, count: diff[list][what].length })).filter(
      (c) => c.count,
    );
  return { added: pick("added"), changed: pick("changed"), removed: pick("removed") };
}

/** A floor that was never published: everything is new. */
function countsFromPlan(plan: ApiPlan): Counts {
  return {
    added: KINDS.map(({ kind, list }) => ({ kind, count: plan[list].length })).filter(
      (c) => c.count,
    ),
    changed: [],
    removed: [],
  };
}

/** Seats with a holder that the draft removes or takes out of assigned use. */
function freedSeatIds(diff: PlanDiff): string[] {
  const removed = diff.objects.removed.map((o) => String(o.id));
  const unassigned = diff.objects.changed
    .filter((c) => "allocation_mode" in c.after && c.after.allocation_mode !== "assigned")
    .map((c) => String(c.id));
  return [...removed, ...unassigned];
}

export function PublishDialog({
  floorId,
  floorName,
  publishedVersion,
  draftVersion,
  document,
  baseRevision,
  open,
  onOpenChange,
  onPublished,
  onRefused,
}: {
  floorId: string;
  floorName: string;
  publishedVersion: number | null;
  draftVersion: number;
  document: ApiPlan;
  baseRevision: () => number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: (result: PublishResult) => void;
  onRefused: (problem: Problem | null) => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const diff = useQuery({
    queryKey: ["plan-diff", floorId, publishedVersion, draftVersion, document],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/floors/{floor_id}/versions/{a}/diff/{b}", {
        params: { path: { floor_id: floorId, a: publishedVersion!, b: draftVersion } },
      });
      if (!data) throw new Error("Couldn't compare the versions");
      return data;
    },
    enabled: open && publishedVersion !== null,
    gcTime: 0,
  });
  const seats = useQuery({ ...floorSeatsQuery(floorId), enabled: open && !!publishedVersion });
  const counts = publishedVersion
    ? diff.data && countsFromDiff(diff.data)
    : countsFromPlan(document);
  const freed = diff.data
    ? freedSeatIds(diff.data)
        .map((id) => seats.data?.get(id))
        .filter((s) => s?.holder_person || s?.holder_unit)
    : [];

  const publish = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/floors/{floor_id}/draft/publish", {
        params: { path: { floor_id: floorId } },
        body: { base_revision: baseRevision(), note: note.trim() || null },
      });
      if (error || !data) throw new ApiProblem(asProblem(error));
      return data;
    },
    onSuccess: onPublished,
    onError: (e) => onRefused(asProblem(e)),
  });

  const line = (what: keyof Counts) =>
    counts?.[what].length ? (
      <li>
        <span className="font-medium">{t(`editor.publish.${what}`)}</span>{" "}
        {counts[what]
          .map((c) => t(`editor.publish.kinds.${c.kind}`, { count: c.count }))
          .join(", ")}
      </li>
    ) : null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogTitle>{t("editor.publish.title", { floor: floorName })}</AlertDialogTitle>
        <AlertDialogDescription>
          {t("editor.publish.explain", { version: draftVersion })}
        </AlertDialogDescription>
        {!counts ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            {t("editor.publish.comparing")}
          </p>
        ) : counts.added.length + counts.changed.length + counts.removed.length === 0 ? (
          <p className="text-sm">{t("editor.publish.noChanges")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {line("added")}
            {line("changed")}
            {line("removed")}
          </ul>
        )}
        {freed.length > 0 && (
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <p className="font-medium">{t("editor.publish.freed", { count: freed.length })}</p>
            <ul className="mt-1 list-disc ps-5">
              {freed.map((s) => (
                <li key={s!.id}>
                  {s!.label ?? t("plan.unlabelled")}:{" "}
                  {s!.holder_person?.display_name ?? s!.holder_unit?.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Field label={t("editor.publish.note")} hint={t("editor.publish.noteHint")}>
          {(c) => <Input {...c} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={publish.isPending || !counts} onClick={() => publish.mutate()}>
            {publish.isPending ? t("editor.publish.publishing") : t("editor.publish.action")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
