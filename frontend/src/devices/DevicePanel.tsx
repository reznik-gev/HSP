/**
 * One device in the side panel, or a new one (docs/0095): asset tag, serial number, notes and
 * the person it's issued to, plus where it's placed. Placing it stays in the editor (an item's
 * Device field). A device never placed is deleted at once, with Undo that adds it back; one in a
 * floor's history is refused by the server (409 in-use) and the panel says why.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { ApiProblem, asProblem, fieldErrors, problemMessage, problemSlug } from "@/api/problems";
import { Button } from "@/components/ui/button";
import { Field, Input, inputClass } from "@/components/ui/field";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetSection,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify, notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { HolderPicker } from "@/seats/HolderPicker";

import { type Device, deviceQuery } from "./data";
import { PersonName, PlacedAt } from "./parts";

export function DevicePanel({
  deviceId,
  onClose,
  onOpen,
}: {
  deviceId: string | null;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const device = useQuery({ ...deviceQuery(deviceId ?? ""), enabled: !!deviceId });
  const title = deviceId
    ? (device.data?.asset_tag ?? (device.data ? t("devices.noTag") : " "))
    : t("devices.new");
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {!deviceId ? (
          <SheetBody>
            <DeviceForm device={null} onSaved={(d) => onOpen(d.id)} />
          </SheetBody>
        ) : device.isError ? (
          <SheetBody>
            <p role="alert" className="text-destructive">
              {t("devices.loadFailed")}
            </p>
          </SheetBody>
        ) : device.data ? (
          <>
            <SheetBody>
              <SheetSection title={t("devices.placement")}>
                <p className="text-sm">
                  {device.data.placement ? (
                    <PlacedAt device={device.data} />
                  ) : (
                    t("devices.notPlaced")
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{t("devices.placeHint")}</p>
              </SheetSection>
              <SheetSection title={t("devices.details")}>
                <DeviceForm key={device.data.id} device={device.data} onSaved={() => {}} />
              </SheetSection>
            </SheetBody>
            <SheetFooter>
              <DeleteButton device={device.data} onDeleted={onClose} />
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DeviceForm({ device, onSaved }: { device: Device | null; onSaved: (d: Device) => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [values, setValues] = useState({
    asset_tag: device?.asset_tag ?? "",
    serial_number: device?.serial_number ?? "",
    notes: device?.notes ?? "",
    assigned_person_id: device?.assigned_person_id ?? null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async (): Promise<Device> => {
      const body = {
        asset_tag: values.asset_tag.trim() || null,
        serial_number: values.serial_number.trim() || null,
        notes: values.notes.trim() || null,
        assigned_person_id: values.assigned_person_id,
      };
      const result = device
        ? await api.PATCH("/api/v1/devices/{device_id}", {
            params: { path: { device_id: device.id } },
            body,
          })
        : await api.POST("/api/v1/devices", { body });
      if (result.error || !result.data) throw new ApiProblem(asProblem(result.error));
      return result.data;
    },
    onSuccess: (saved) => {
      setErrors({});
      void client.invalidateQueries({ queryKey: ["devices"] });
      notify(t(device ? "devices.saved" : "devices.created"));
      onSaved(saved);
    },
    onError: (error) => {
      const problem = asProblem(error);
      const byField = fieldErrors(problem);
      if (problemSlug(problem) === "asset-tag-taken") byField.asset_tag = t("devices.tagTaken");
      setErrors(byField);
      if (!Object.keys(byField).length) notifyError(problemMessage(problem, t("common.failed")));
    },
  });
  const text = (name: "asset_tag" | "serial_number", label: string) => (
    <Field label={label} error={errors[name]}>
      {(control) => (
        <Input
          {...control}
          dir="ltr"
          autoComplete="off"
          value={values[name]}
          onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
        />
      )}
    </Field>
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {text("asset_tag", t("devices.fields.tag"))}
      {text("serial_number", t("devices.fields.serial"))}
      <Field label={t("devices.fields.notes")}>
        {(control) => (
          <textarea
            {...control}
            rows={3}
            value={values.notes}
            onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
            className={cn(inputClass, "h-auto py-2")}
          />
        )}
      </Field>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("devices.fields.issuedTo")}</p>
        {values.assigned_person_id ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex-1">
              <PersonName id={values.assigned_person_id} />
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setValues((v) => ({ ...v, assigned_person_id: null }))}
            >
              <X aria-hidden />
              {t("devices.notIssued")}
            </Button>
          </div>
        ) : (
          <HolderPicker
            teams={false}
            label={t("devices.pickPerson")}
            onPick={(h) => setValues((v) => ({ ...v, assigned_person_id: h.id }))}
          />
        )}
      </div>
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? t("common.saving") : t(device ? "common.save" : "devices.create")}
      </Button>
    </form>
  );
}

function DeleteButton({ device, onDeleted }: { device: Device; onDeleted: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [inUse, setInUse] = useState(false);
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE("/api/v1/devices/{device_id}", {
        params: { path: { device_id: device.id } },
      });
      if (error) throw new ApiProblem(asProblem(error));
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["devices"] });
      onDeleted();
      notify(t("devices.deleted", { tag: device.asset_tag ?? t("devices.noTag") }), {
        undo: async () => {
          const { error } = await api.POST("/api/v1/devices", {
            body: {
              asset_tag: device.asset_tag,
              serial_number: device.serial_number,
              notes: device.notes,
              assigned_person_id: device.assigned_person_id,
            },
          });
          await client.invalidateQueries({ queryKey: ["devices"] });
          if (error) notifyError(problemMessage(asProblem(error), t("common.failed")));
          else notify(t("devices.restored"));
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
          {t("devices.inUse")}
        </p>
      )}
      <Button variant="outline" onClick={() => remove.mutate()} disabled={remove.isPending}>
        <Trash2 aria-hidden />
        {t("devices.delete")}
      </Button>
    </div>
  );
}
