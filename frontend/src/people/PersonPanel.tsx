/**
 * One person in the side panel (docs/0088 choices 5, 6, 10): details, teams, seats and devices.
 * Admins edit details and teams, create people, and deactivate or reactivate them;
 * deactivating frees their seats (docs/0085) and offers Undo, which gives back the seats that
 * are still free.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
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
import { positionsQuery, treeOrder, unitsQuery } from "@/org/units";

import {
  type Person,
  personDevicesQuery,
  personQuery,
  personSeatsQuery,
  undoDeactivation,
} from "./data";

export function PersonPanel({
  personId,
  onClose,
  onCreated,
}: {
  personId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const person = useQuery({ ...personQuery(personId ?? ""), enabled: !!personId });
  const title = personId ? (person.data?.display_name ?? " ") : t("people.new");
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {person.data && (
            <SheetDescription>
              <bdi>{person.data.email}</bdi>
            </SheetDescription>
          )}
        </SheetHeader>
        {!personId ? (
          <SheetBody>
            <DetailsForm person={null} onSaved={(p) => onCreated(p.id)} />
          </SheetBody>
        ) : person.isError ? (
          <SheetBody>
            <p role="alert" className="text-destructive">
              {t("people.loadFailed")}
            </p>
          </SheetBody>
        ) : person.data ? (
          <>
            <SheetBody>
              {!person.data.active && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">{t("people.isInactive")}</p>
              )}
              <DetailsSection person={person.data} />
              <TeamsSection person={person.data} />
              <SeatsSection personId={person.data.id} />
              <DevicesSection personId={person.data.id} />
            </SheetBody>
            <AdminOnly>
              <SheetFooter>
                <ActiveToggle person={person.data} />
              </SheetFooter>
            </AdminOnly>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

// --- Details ---------------------------------------------------------------------------------

function DetailsSection({ person }: { person: Person }) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  return (
    <Section title={t("people.details")}>
      {isAdmin ? (
        <DetailsForm key={person.id} person={person} />
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">{t("people.fields.title")}</dt>
          <dd>{person.title ?? "–"}</dd>
          <dt className="text-muted-foreground">{t("people.fields.externalId")}</dt>
          <dd dir="ltr" className="text-start">
            {person.external_id ?? "–"}
          </dd>
        </dl>
      )}
    </Section>
  );
}

function DetailsForm({
  person,
  onSaved,
}: {
  person: Person | null;
  onSaved?: (p: Person) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [values, setValues] = useState({
    display_name: person?.display_name ?? "",
    email: person?.email ?? "",
    title: person?.title ?? "",
    external_id: person?.external_id ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        display_name: values.display_name.trim(),
        email: values.email.trim(),
        title: values.title.trim() || null,
        external_id: values.external_id.trim() || null,
      };
      const result = person
        ? await api.PATCH("/api/v1/people/{person_id}", {
            params: { path: { person_id: person.id } },
            body,
          })
        : await api.POST("/api/v1/people", { body });
      if (result.error || !result.data) throw new ApiProblem(asProblem(result.error));
      return result.data;
    },
    onSuccess: (saved) => {
      setErrors({});
      void client.invalidateQueries({ queryKey: ["people"] });
      client.setQueryData(personQuery(saved.id).queryKey, saved);
      notify(t(person ? "people.saved" : "people.created", { name: saved.display_name }));
      onSaved?.(saved);
    },
    onError: (error) => {
      const problem = asProblem(error);
      const byField = fieldErrors(problem);
      const slug = problemSlug(problem);
      if (slug === "email-taken") byField.email = t("people.errors.emailTaken");
      if (slug === "external-id-taken") byField.external_id = t("people.errors.externalIdTaken");
      setErrors(byField);
      if (!Object.keys(byField).length) notifyError(problemMessage(problem, t("common.failed")));
    },
  });
  const field = (name: keyof typeof values, label: string, props: object = {}) => (
    <Field label={label} error={errors[name]}>
      {(control) => (
        <Input
          {...control}
          {...props}
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
      {field("display_name", t("people.fields.name"), { required: true, autoComplete: "off" })}
      {field("email", t("people.fields.email"), { required: true, type: "email", dir: "ltr" })}
      {field("title", t("people.fields.title"))}
      {field("external_id", t("people.fields.externalId"), { dir: "ltr" })}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? t("common.saving") : t(person ? "common.save" : "people.create")}
      </Button>
    </form>
  );
}

// --- Teams -----------------------------------------------------------------------------------

interface Row {
  unit_id: string;
  position_id: string | null;
  is_primary: boolean;
}

function TeamsSection({ person }: { person: Person }) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const units = useQuery(unitsQuery);
  const name = new Map(units.data?.map((u) => [u.id, u.name]));
  if (!isAdmin) {
    return (
      <Section title={t("people.teams")}>
        {person.memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("people.noTeams")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {person.memberships.map((m) => (
              <li key={m.unit_id}>
                {name.get(m.unit_id) ?? "…"}
                {m.is_primary && (
                  <span className="ms-2 text-xs text-muted-foreground">{t("people.primary")}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    );
  }
  return (
    <Section title={t("people.teams")}>
      <TeamsEditor key={JSON.stringify(person.memberships)} person={person} />
    </Section>
  );
}

function TeamsEditor({ person }: { person: Person }) {
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
                {"  ".repeat(depth) + unit.name}
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

// --- Seats and devices -----------------------------------------------------------------------

function SeatsSection({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const seats = useQuery(personSeatsQuery(personId));
  return (
    <Section title={t("people.seats")}>
      {seats.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("people.noSeats")}</p>
      )}
      <ul className="space-y-2">
        {seats.data?.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
            <div>
              <div className="font-medium">{s.label ?? t("plan.unlabelled")}</div>
              <div className="text-xs text-muted-foreground">
                {s.building.name} › {s.floor.name}
              </div>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/floors/$floorId" params={{ floorId: s.floor.id }} search={{ seat: s.id }}>
                <MapPin aria-hidden />
                {t("search.showOnPlan")}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function DevicesSection({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const devices = useQuery(personDevicesQuery(personId));
  return (
    <Section title={t("people.devices")}>
      {devices.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("people.noDevices")}</p>
      )}
      <ul className="space-y-2 text-sm">
        {devices.data?.map((d) => (
          <li key={d.id}>
            <div className="font-medium" dir="ltr">
              {d.asset_tag ?? d.serial_number ?? "–"}
            </div>
            <div className="text-xs text-muted-foreground">
              {d.placement ? d.placement.floor_name : t("people.notPlaced")}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// --- Deactivate / reactivate -----------------------------------------------------------------

function ActiveToggle({ person }: { person: Person }) {
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
