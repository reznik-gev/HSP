/**
 * Edits a person's teams as rows of team + position, with one primary team once there are
 * several (docs/0084). Saves them all at once, replacing the person's memberships.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { ApiProblem, asProblem, problemMessage } from "@/api/problems";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { notify } from "@/lib/notify";
import { positionsQuery, treeOrder, unitsQuery } from "@/org/units";

import { type Person, personQuery } from "../data";

interface Row {
  unit_id: string;
  position_id: string | null;
  is_primary: boolean;
}

export function TeamsEditor({ person }: { person: Person }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const units = useQuery(unitsQuery);
  const options = units.data
    ? treeOrder(
        units.data.filter((u) => !u.archived_at),
        new Intl.Collator(i18n.resolvedLanguage),
      )
    : [];
  const [rows, setRows] = useState<Row[]>(
    person.memberships.map((m) => ({
      unit_id: m.unit_id,
      position_id: m.position_id,
      // Mark the current primary explicitly once there are several teams (docs/0084).
      is_primary: m.is_primary,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const update = (i: number, change: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...change } : r)));
  const save = useMutation({
    mutationFn: async () => {
      const body = rows.map((r) => ({
        ...r,
        // A lone team is primary by itself (docs/0084).
        is_primary: rows.length === 1 ? false : r.is_primary,
      }));
      const { data, error: e } = await api.PUT("/api/v1/people/{person_id}/memberships", {
        params: { path: { person_id: person.id } },
        body,
      });
      if (e || !data) throw new ApiProblem(asProblem(e));
      return data;
    },
    onSuccess: (saved) => {
      setError(null);
      client.setQueryData(personQuery(saved.id).queryKey, saved);
      void client.invalidateQueries({ queryKey: ["people"] });
      notify(t("people.teamsSaved"));
    },
    onError: (e) => {
      const problem = asProblem(e);
      const codes = new Set(problem?.errors?.map((x) => x.code));
      setError(
        codes.has("primary_required")
          ? t("people.errors.primaryRequired")
          : codes.has("duplicate_unit")
            ? t("people.errors.duplicateTeam")
            : problemMessage(problem, t("common.failed")),
      );
    },
  });
  const dirty =
    JSON.stringify(rows) !==
    JSON.stringify(
      person.memberships.map((m) => ({
        unit_id: m.unit_id,
        position_id: m.position_id,
        is_primary: m.is_primary,
      })),
    );
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{t("people.noTeams")}</p>}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select
            aria-label={t("people.fields.team")}
            value={row.unit_id}
            onChange={(e) => update(i, { unit_id: e.target.value, position_id: null })}
            className="min-w-0 flex-1"
          >
            {options.map(({ unit, depth }) => (
              <option key={unit.id} value={unit.id}>
                {"  ".repeat(depth) + unit.name}
              </option>
            ))}
          </Select>
          <PositionSelect
            unitId={row.unit_id}
            value={row.position_id}
            onChange={(position_id) => update(i, { position_id })}
          />
          {rows.length > 1 && (
            <label className="flex shrink-0 items-center gap-1 text-xs">
              <input
                type="radio"
                name={`primary-${person.id}`}
                checked={row.is_primary}
                onChange={() => setRows((rs) => rs.map((r, j) => ({ ...r, is_primary: j === i })))}
                className="accent-[var(--primary)]"
              />
              {t("people.primary")}
            </label>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("people.removeTeam")}
            onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!options.length}
          onClick={() =>
            setRows((rs) => [
              ...rs,
              {
                unit_id: options[0]?.unit.id ?? "",
                position_id: null,
                is_primary: rs.length === 0,
              },
            ])
          }
        >
          <Plus aria-hidden />
          {t("people.addTeam")}
        </Button>
        {dirty && (
          <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t("common.saving") : t("people.saveTeams")}
          </Button>
        )}
      </div>
    </div>
  );
}

function PositionSelect({
  unitId,
  value,
  onChange,
}: {
  unitId: string;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const positions = useQuery({ ...positionsQuery(unitId), enabled: !!unitId });
  return (
    <Select
      aria-label={t("people.fields.position")}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-36"
    >
      <option value="">{t("people.noPosition")}</option>
      {positions.data?.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title}
        </option>
      ))}
    </Select>
  );
}
