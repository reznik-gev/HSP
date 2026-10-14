/** Edits a team's name, level, parent and team code, or creates a team when `unit` is null. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { ApiProblem, asProblem, fieldErrors, problemMessage, problemSlug } from "@/api/problems";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { notify, notifyError } from "@/lib/notify";

import { treeOrder, type Unit, unitsQuery } from "../units";

/** Teams a unit may move under: anything but itself and its own sub-teams (docs/0084). */
function possibleParents(units: Unit[], self: Unit | null): Set<string> {
  if (!self) return new Set(units.map((u) => u.id));
  const below = new Set([self.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const u of units) {
      if (u.parent_id && below.has(u.parent_id) && !below.has(u.id)) {
        below.add(u.id);
        grew = true;
      }
    }
  }
  return new Set(units.filter((u) => !below.has(u.id)).map((u) => u.id));
}

export function UnitForm({ unit, onSaved }: { unit: Unit | null; onSaved?: (u: Unit) => void }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const units = useQuery(unitsQuery);
  const active = (units.data ?? []).filter((u) => !u.archived_at);
  const allowed = possibleParents(active, unit);
  const options = treeOrder(active, new Intl.Collator(i18n.resolvedLanguage)).filter((n) =>
    allowed.has(n.unit.id),
  );
  const root = active.find((u) => !u.parent_id);
  const [values, setValues] = useState({
    name: unit?.name ?? "",
    level_label: unit?.level_label ?? "",
    parent_id: unit ? (unit.parent_id ?? "") : (root?.id ?? ""),
    external_id: unit?.external_id ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: values.name.trim(),
        level_label: values.level_label.trim() || null,
        external_id: values.external_id.trim() || null,
        parent_id: values.parent_id || null,
      };
      const result = unit
        ? await api.PATCH("/api/v1/org-units/{unit_id}", {
            params: { path: { unit_id: unit.id } },
            // The root has no parent and can't get one.
            body: unit.parent_id ? body : { ...body, parent_id: undefined },
          })
        : await api.POST("/api/v1/org-units", { body });
      if (result.error || !result.data) throw new ApiProblem(asProblem(result.error));
      return result.data;
    },
    onSuccess: (saved) => {
      setErrors({});
      void client.invalidateQueries({ queryKey: unitsQuery.queryKey });
      notify(t(unit ? "org.saved" : "org.created", { name: saved.name }));
      onSaved?.(saved);
    },
    onError: (error) => {
      const problem = asProblem(error);
      const byField = fieldErrors(problem);
      const slug = problemSlug(problem);
      if (slug === "unit-cycle") byField.parent_id = t("org.errors.cycle");
      if (slug === "external-id-taken") byField.external_id = t("org.errors.externalIdTaken");
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
      <Field label={t("org.fields.name")} error={errors.name}>
        {(c) => (
          <Input
            {...c}
            required
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          />
        )}
      </Field>
      <Field label={t("org.fields.level")} hint={t("org.fields.levelHint")}>
        {(c) => (
          <Input
            {...c}
            value={values.level_label}
            onChange={(e) => setValues((v) => ({ ...v, level_label: e.target.value }))}
          />
        )}
      </Field>
      {(!unit || unit.parent_id) && (
        <Field label={t("org.fields.parent")} error={errors.parent_id}>
          {(c) => (
            <Select
              {...c}
              value={values.parent_id}
              onChange={(e) => setValues((v) => ({ ...v, parent_id: e.target.value }))}
            >
              {options.map(({ unit: u, depth }) => (
                <option key={u.id} value={u.id}>
                  {"  ".repeat(depth) + u.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field label={t("org.fields.externalId")} error={errors.external_id}>
        {(c) => (
          <Input
            {...c}
            dir="ltr"
            value={values.external_id}
            onChange={(e) => setValues((v) => ({ ...v, external_id: e.target.value }))}
          />
        )}
      </Field>
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? t("common.saving") : t(unit ? "common.save" : "org.create")}
      </Button>
    </form>
  );
}
