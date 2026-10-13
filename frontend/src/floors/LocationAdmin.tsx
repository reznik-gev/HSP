/**
 * Managing locations on the Floors page (docs/0078, docs/0086, docs/0088 choice 9): add, edit
 * and archive sites, buildings and floors. Archiving cascades down and frees the seats it takes
 * out of use; the notice says so and offers Undo, which restores top-down and gives back seats
 * that are still free.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { ApiProblem, asProblem, fieldErrors, problemMessage, problemSlug } from "@/api/problems";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Input } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { notify, notifyError } from "@/lib/notify";

type ReleaseReport = components["schemas"]["ReleaseReport"];
export type LocationKind = "site" | "building" | "floor";

/** What the location sheet is doing: creating under a parent, or editing an existing item. */
export type LocationEdit =
  | { kind: "site"; item?: { id: string; name: string; time_zone: string; address: string | null } }
  | { kind: "building"; siteId: string; item?: { id: string; name: string; code: string } }
  | { kind: "floor"; buildingId: string; item?: { id: string; name: string; level_index: number } };

const COLLECTIONS = { site: "sites", building: "buildings", floor: "floors" } as const;

function refreshAll(client: ReturnType<typeof useQueryClient>) {
  for (const key of [
    ["sites"],
    ["occupancy"],
    ["floor-place"],
    ["seats"],
    ["seat-search"],
    ["people"],
  ]) {
    void client.invalidateQueries({ queryKey: key });
  }
}

export function LocationMenu({
  label,
  onEdit,
  onAdd,
  addLabel,
  onArchive,
}: {
  label: string;
  onEdit: () => void;
  onAdd?: () => void;
  addLabel?: string;
  onArchive: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("locations.actionsFor", { name: label })}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onSelect={onEdit}>{t("locations.edit")}</DropdownMenuItem>
        {onAdd && <DropdownMenuItem onSelect={onAdd}>{addLabel}</DropdownMenuItem>}
        <DropdownMenuItem onSelect={onArchive}>{t("locations.archive")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Archive with an Undo notice (docs/0088 choice 6). */
export function useArchive() {
  const { t } = useTranslation();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, id }: { kind: LocationKind; id: string; name: string }) => {
      const path = `/api/v1/${COLLECTIONS[kind]}/${id}`;
      const { data, error } = await (kind === "site"
        ? api.DELETE("/api/v1/sites/{site_id}", { params: { path: { site_id: id } } })
        : kind === "building"
          ? api.DELETE("/api/v1/buildings/{building_id}", { params: { path: { building_id: id } } })
          : api.DELETE("/api/v1/floors/{floor_id}", { params: { path: { floor_id: id } } }));
      if (error || !data) throw new ApiProblem(asProblem(error) ?? { title: path });
      return data;
    },
    onSuccess: (report, { name }) => {
      refreshAll(client);
      const others = report.archived.length - 1;
      const parts = [
        others > 0 && t("locations.alsoArchived", { count: others }),
        report.freed_seats.length > 0 &&
          t("people.seatsFreed", { count: report.freed_seats.length }),
      ].filter(Boolean);
      notify(t("locations.archived", { name }), {
        description: parts.join(" · ") || undefined,
        undo: async () => {
          const skipped = await undoLocationArchive(report);
          refreshAll(client);
          notify(
            t("locations.restored", { name }),
            skipped ? { description: t("people.seatsTaken", { count: skipped }) } : {},
          );
        },
      });
    },
    onError: (e) => {
      const problem = asProblem(e);
      notifyError(
        problemSlug(problem) === "floor-locked"
          ? t("locations.errors.beingEdited")
          : problemMessage(problem, t("common.failed")),
      );
    },
  });
}

/** Restore top-down (the report lists the archived item first), then give back free seats. */
export async function undoLocationArchive(report: ReleaseReport): Promise<number> {
  for (const item of report.archived) {
    if (item.kind === "site") {
      await api.POST("/api/v1/sites/{site_id}/restore", { params: { path: { site_id: item.id } } });
    } else if (item.kind === "building") {
      await api.POST("/api/v1/buildings/{building_id}/restore", {
        params: { path: { building_id: item.id } },
      });
    } else {
      await api.POST("/api/v1/floors/{floor_id}/restore", {
        params: { path: { floor_id: item.id } },
      });
    }
  }
  let skipped = 0;
  for (const seat of report.freed_seats) {
    const { data } = await api.GET("/api/v1/seats/{seat_id}/assignment", {
      params: { path: { seat_id: seat.seat_id } },
    });
    if (!data || data.assignment) {
      skipped += 1;
      continue;
    }
    const { error } = await api.PUT("/api/v1/seats/{seat_id}/assignment", {
      params: { path: { seat_id: seat.seat_id } },
      body: seat.holder_person_id
        ? { person_id: seat.holder_person_id }
        : { unit_id: seat.holder_unit_id },
    });
    if (error) skipped += 1;
  }
  return skipped;
}

const TIME_ZONES: readonly string[] =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

export function LocationSheet({ edit, onClose }: { edit: LocationEdit; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const item = edit.item;
  const [values, setValues] = useState<Record<string, string>>((): Record<string, string> => {
    if (edit.kind === "site") {
      return {
        name: edit.item?.name ?? "",
        time_zone: edit.item?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        address: edit.item?.address ?? "",
      };
    }
    if (edit.kind === "building")
      return { name: edit.item?.name ?? "", code: edit.item?.code ?? "" };
    return { name: edit.item?.name ?? "", level_index: String(edit.item?.level_index ?? "") };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      let result: { error?: unknown; data?: unknown };
      if (edit.kind === "site") {
        const body = {
          name: values.name!.trim(),
          time_zone: values.time_zone!.trim(),
          address: values.address!.trim() || null,
        };
        result = edit.item
          ? await api.PATCH("/api/v1/sites/{site_id}", {
              params: { path: { site_id: edit.item.id } },
              body,
            })
          : await api.POST("/api/v1/sites", { body });
      } else if (edit.kind === "building") {
        const body = { name: values.name!.trim(), code: values.code!.trim() };
        result = edit.item
          ? await api.PATCH("/api/v1/buildings/{building_id}", {
              params: { path: { building_id: edit.item.id } },
              body,
            })
          : await api.POST("/api/v1/buildings", { body: { ...body, site_id: edit.siteId } });
      } else {
        const body = { name: values.name!.trim(), level_index: Number(values.level_index) };
        result = edit.item
          ? await api.PATCH("/api/v1/floors/{floor_id}", {
              params: { path: { floor_id: edit.item.id } },
              body,
            })
          : await api.POST("/api/v1/floors", {
              body: {
                ...body,
                building_id: edit.buildingId,
                // Drawing settings belong to the editor (phase 3); the server defaults apply.
                elevation_mm: 0,
                default_wall_height_mm: 2800,
                origin_x_mm: 0,
                origin_y_mm: 0,
              },
            });
      }
      if (result.error || !result.data) throw new ApiProblem(asProblem(result.error));
    },
    onSuccess: () => {
      refreshAll(client);
      notify(t(item ? "locations.saved" : "locations.created", { name: values.name!.trim() }));
      onClose();
    },
    onError: (e) => {
      const problem = asProblem(e);
      const byField = fieldErrors(problem);
      const slug = problemSlug(problem);
      if (slug === "code-taken") byField.code = t("locations.errors.codeTaken");
      if (slug === "level-taken") byField.level_index = t("locations.errors.levelTaken");
      setErrors(byField);
      if (!Object.keys(byField).length) notifyError(problemMessage(problem, t("common.failed")));
    },
  });

  const title = t(`locations.${item ? "editTitle" : "newTitle"}.${edit.kind}`);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label={t("locations.fields.name")} error={errors.name}>
              {(c) => <Input {...c} required value={values.name} onChange={set("name")} />}
            </Field>
            {edit.kind === "site" && (
              <>
                <Field label={t("locations.fields.timeZone")} error={errors.time_zone}>
                  {(c) => (
                    <>
                      <Input
                        {...c}
                        required
                        dir="ltr"
                        list="hsp-time-zones"
                        value={values.time_zone}
                        onChange={set("time_zone")}
                      />
                      <datalist id="hsp-time-zones">
                        {TIME_ZONES.map((z) => (
                          <option key={z} value={z} />
                        ))}
                      </datalist>
                    </>
                  )}
                </Field>
                <Field label={t("locations.fields.address")}>
                  {(c) => <Input {...c} value={values.address} onChange={set("address")} />}
                </Field>
              </>
            )}
            {edit.kind === "building" && (
              <Field
                label={t("locations.fields.code")}
                hint={t("locations.fields.codeHint")}
                error={errors.code}
              >
                {(c) => (
                  <Input {...c} required dir="ltr" value={values.code} onChange={set("code")} />
                )}
              </Field>
            )}
            {edit.kind === "floor" && (
              <Field
                label={t("locations.fields.level")}
                hint={t("locations.fields.levelHint")}
                error={errors.level_index}
              >
                {(c) => (
                  <Input
                    {...c}
                    required
                    type="number"
                    step={1}
                    value={values.level_index}
                    onChange={set("level_index")}
                  />
                )}
              </Field>
            )}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t("common.saving") : t(item ? "common.save" : "locations.create")}
            </Button>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
