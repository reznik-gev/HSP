/**
 * Zone types, the Catalog screen's second tab (docs/0095): name, colour and whether it's an
 * enclosed room. Admins add and change them in the side panel, and delete one that no zone has
 * ever used; the server refuses the rest (409 in-use), and the panel explains why. Deleting acts
 * at once with Undo, which adds the type back (docs/0088 choice 6).
 */
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { ApiProblem, asProblem, fieldErrors, problemMessage, problemSlug } from "@/api/problems";
import type { components } from "@/api/schema";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify, notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";

export type ZoneType = components["schemas"]["ZoneTypeOut"];

const DEFAULT_COLOR = "#cbd5e1"; // the plan's fill for a zone type without a colour

export const zoneTypeListQuery = queryOptions({
  queryKey: ["zone-types", "list"],
  queryFn: async (): Promise<ZoneType[]> => {
    const { data } = await api.GET("/api/v1/zone-types");
    if (!data) throw new Error("Couldn't load zone types");
    return data.items;
  },
});

export function ZoneTypeList({
  selected,
  onOpen,
}: {
  selected: string | undefined;
  onOpen: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const types = useQuery(zoneTypeListQuery);
  if (types.isPending) return null;
  if (types.isError) {
    return (
      <p role="alert" className="text-destructive">
        {t("zoneTypes.loadFailed")}
      </p>
    );
  }
  if (types.data.length === 0)
    return <p className="text-muted-foreground">{t("zoneTypes.none")}</p>;
  const collator = new Intl.Collator(i18n.resolvedLanguage);
  return (
    <ul className="divide-y overflow-hidden rounded-md border bg-card">
      {[...types.data]
        .sort((a, b) => collator.compare(a.name, b.name))
        .map((z) => (
          <li
            key={z.id}
            className={cn("flex items-center gap-3 px-3 py-2.5", z.id === selected && "bg-accent")}
          >
            <span
              className="size-5 shrink-0 rounded-sm border"
              style={{ backgroundColor: z.color ?? DEFAULT_COLOR }}
              aria-hidden
            />
            <button
              type="button"
              className="flex-1 text-start font-medium hover:text-primary hover:underline"
              onClick={() => onOpen(z.id)}
            >
              {z.name}
            </button>
            {z.is_enclosed && (
              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {t("zoneTypes.enclosed")}
              </span>
            )}
          </li>
        ))}
    </ul>
  );
}

/** One zone type in the side panel, or a new one when `zoneTypeId` is null. */
export function ZoneTypePanel({
  zoneTypeId,
  onClose,
  onOpen,
}: {
  zoneTypeId: string | null;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const types = useQuery(zoneTypeListQuery);
  const type = zoneTypeId ? types.data?.find((z) => z.id === zoneTypeId) : null;
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{zoneTypeId ? (type?.name ?? " ") : t("zoneTypes.new")}</SheetTitle>
        </SheetHeader>
        {zoneTypeId && types.data && !type ? (
          <SheetBody>
            <p role="alert" className="text-destructive">
              {t("zoneTypes.gone")}
            </p>
          </SheetBody>
        ) : type !== undefined ? (
          <>
            <SheetBody>
              <ZoneTypeForm key={type?.id ?? "new"} type={type} onSaved={(z) => onOpen(z.id)} />
            </SheetBody>
            {type && (
              <SheetFooter>
                <DeleteButton type={type} onDeleted={onClose} />
              </SheetFooter>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ZoneTypeForm({
  type,
  onSaved,
}: {
  type: ZoneType | null;
  onSaved: (z: ZoneType) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [values, setValues] = useState({
    name: type?.name ?? "",
    color: type?.color ?? DEFAULT_COLOR,
    is_enclosed: type?.is_enclosed ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async (): Promise<ZoneType> => {
      const body = { ...values, name: values.name.trim() };
      const result = type
        ? await api.PATCH("/api/v1/zone-types/{zone_type_id}", {
            params: { path: { zone_type_id: type.id } },
            body,
          })
        : await api.POST("/api/v1/zone-types", { body });
      if (result.error || !result.data) throw new ApiProblem(asProblem(result.error));
      return result.data;
    },
    onSuccess: (saved) => {
      setErrors({});
      void client.invalidateQueries({ queryKey: ["zone-types"] });
      notify(t(type ? "zoneTypes.saved" : "zoneTypes.created", { name: saved.name }));
      onSaved(saved);
    },
    onError: (error) => {
      const problem = asProblem(error);
      const byField = fieldErrors(problem);
      if (problemSlug(problem) === "name-taken") byField.name = t("zoneTypes.nameTaken");
      setErrors(byField);
      if (!Object.keys(byField).length) notifyError(problemMessage(problem, t("common.failed")));
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label={t("zoneTypes.fields.name")} error={errors.name}>
        {(control) => (
          <Input
            {...control}
            required
            autoComplete="off"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          />
        )}
      </Field>
      <Field label={t("zoneTypes.fields.color")}>
        {(control) => (
          <Input
            {...control}
            type="color"
            className="h-9 w-20 p-1"
            value={values.color}
            onChange={(e) => setValues((v) => ({ ...v, color: e.target.value }))}
          />
        )}
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.is_enclosed}
          onChange={(e) => setValues((v) => ({ ...v, is_enclosed: e.target.checked }))}
          className="mt-0.5 size-4 accent-[var(--primary)]"
        />
        <span>
          {t("zoneTypes.fields.enclosed")}
          <span className="block text-xs text-muted-foreground">{t("zoneTypes.enclosedHint")}</span>
        </span>
      </label>
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? t("common.saving") : t(type ? "common.save" : "zoneTypes.create")}
      </Button>
    </form>
  );
}

function DeleteButton({ type, onDeleted }: { type: ZoneType; onDeleted: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [inUse, setInUse] = useState(false);
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE("/api/v1/zone-types/{zone_type_id}", {
        params: { path: { zone_type_id: type.id } },
      });
      if (error) throw new ApiProblem(asProblem(error));
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["zone-types"] });
      onDeleted();
      notify(t("zoneTypes.deleted", { name: type.name }), {
        undo: async () => {
          const { error } = await api.POST("/api/v1/zone-types", {
            body: { name: type.name, color: type.color, is_enclosed: type.is_enclosed },
          });
          await client.invalidateQueries({ queryKey: ["zone-types"] });
          if (error) notifyError(problemMessage(asProblem(error), t("common.failed")));
          else notify(t("zoneTypes.restored", { name: type.name }));
        },
      });
    },
    onError: (error) => {
      const problem = asProblem(error);
      if (problemSlug(problem) === "in-use") setInUse(true);
      else notifyError(problemMessage(problem, t("common.failed")));
    },
  });
  return (
    <div className="space-y-2">
      {inUse && (
        <p role="alert" className="text-sm text-destructive">
          {t("zoneTypes.inUse")}
        </p>
      )}
      <Button variant="outline" onClick={() => remove.mutate()} disabled={remove.isPending}>
        <Trash2 aria-hidden />
        {t("zoneTypes.delete")}
      </Button>
    </div>
  );
}
