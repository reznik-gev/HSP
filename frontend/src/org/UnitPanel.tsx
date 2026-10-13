/**
 * One team in the side panel (docs/0084, docs/0088): details, positions and members. Admins
 * create teams, rename and move them (never under their own sub-team), manage positions and
 * archive teams. Archiving takes the sub-teams along, moves members up to the parent team and
 * frees seats reserved for the archived teams (docs/0086); the notice offers Undo.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { ApiProblem, asProblem, fieldErrors, problemMessage, problemSlug } from "@/api/problems";
import { AdminOnly, useIsAdmin } from "@/auth/admin";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify, notifyError } from "@/lib/notify";

import { undoUnitArchive } from "./undo";
import { positionsQuery, treeOrder, type Unit, unitsQuery } from "./units";

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
          <SheetTitle>{unitId ? (unit?.name ?? " ") : t("org.new")}</SheetTitle>
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
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">{t("org.details")}</h3>
                  <UnitForm key={unit.id} unit={unit} />
                </section>
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

function UnitForm({ unit, onSaved }: { unit: Unit | null; onSaved?: (u: Unit) => void }) {
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
                  {"  ".repeat(depth) + u.name}
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

function Positions({ unitId }: { unitId: string }) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const client = useQueryClient();
  const positions = useQuery(positionsQuery(unitId));
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const refresh = () => void client.invalidateQueries({ queryKey: ["positions", unitId] });
  const run = useMutation({
    mutationFn: async (action: () => Promise<{ error?: unknown }>) => {
      const { error } = await action();
      if (error) throw new ApiProblem(asProblem(error));
    },
    onSuccess: refresh,
    onError: (e) => notifyError(problemMessage(asProblem(e), t("common.failed"))),
  });
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t("org.positions")}</h3>
      {positions.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("org.noPositions")}</p>
      )}
      <ul className="space-y-1 text-sm">
        {positions.data?.map((p) =>
          editing?.id === p.id ? (
            <li key={p.id} className="flex items-center gap-2">
              <Input
                aria-label={t("org.positionTitle")}
                value={editing.title}
                onChange={(e) => setEditing({ id: p.id, title: e.target.value })}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("common.save")}
                onClick={() => {
                  const title = editing.title.trim();
                  setEditing(null);
                  if (title && title !== p.title)
                    run.mutate(() =>
                      api.PATCH("/api/v1/positions/{position_id}", {
                        params: { path: { position_id: p.id } },
                        body: { title },
                      }),
                    );
                }}
              >
                <Check aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("common.cancel")}
                onClick={() => setEditing(null)}
              >
                <X aria-hidden />
              </Button>
            </li>
          ) : (
            <li key={p.id} className="flex h-9 items-center gap-1">
              <span className="flex-1">{p.title}</span>
              {isAdmin && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("org.renamePosition", { title: p.title })}
                    onClick={() => setEditing({ id: p.id, title: p.title })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("org.removePosition", { title: p.title })}
                    onClick={() =>
                      run.mutate(
                        () =>
                          api.DELETE("/api/v1/positions/{position_id}", {
                            params: { path: { position_id: p.id } },
                          }),
                        {
                          onSuccess: () => {
                            void client.invalidateQueries({ queryKey: ["people"] });
                            notify(t("org.positionRemoved", { title: p.title }));
                          },
                        },
                      )
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </>
              )}
            </li>
          ),
        )}
      </ul>
      {isAdmin && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const title = adding.trim();
            if (!title) return;
            setAdding("");
            run.mutate(() =>
              api.POST("/api/v1/org-units/{unit_id}/positions", {
                params: { path: { unit_id: unitId } },
                body: { title },
              }),
            );
          }}
        >
          <Input
            aria-label={t("org.newPosition")}
            placeholder={t("org.newPosition")}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!adding.trim()}>
            <Plus aria-hidden />
            {t("org.addPosition")}
          </Button>
        </form>
      )}
    </section>
  );
}

function Members({ unitId }: { unitId: string }) {
  const { t } = useTranslation();
  const members = useQuery({
    queryKey: ["people", { unit: unitId, panel: true }],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/people", {
        params: { query: { unit_id: unitId, limit: 200 } },
      });
      if (!data) throw new Error("Couldn't load members");
      return data.items;
    },
  });
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t("org.membersTitle")}</h3>
      {members.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("org.noMembers")}</p>
      )}
      <ul className="space-y-1.5 text-sm">
        {members.data?.map((p) => {
          const m = p.memberships.find((x) => x.unit_id === unitId);
          return (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <Link
                to="/people"
                search={{ person: p.id }}
                className="hover:text-primary hover:underline"
              >
                {p.display_name}
              </Link>
              {m?.is_primary === false && (
                <span className="text-xs text-muted-foreground">{t("org.secondary")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ArchiveButton({ unit, onArchived }: { unit: Unit; onArchived: () => void }) {
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
