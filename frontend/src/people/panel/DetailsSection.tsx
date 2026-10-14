/** A person's name, email, title and personal number: a form for admins, a list for others. */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { ApiProblem, asProblem, fieldErrors, problemMessage, problemSlug } from "@/api/problems";
import { useIsAdmin } from "@/auth/admin";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SheetSection } from "@/components/ui/sheet";
import { notify, notifyError } from "@/lib/notify";

import { type Person, personQuery } from "../data";

export function DetailsSection({ person }: { person: Person }) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  return (
    <SheetSection title={t("people.details")}>
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
    </SheetSection>
  );
}

/** Edits a person, or creates one when `person` is null. */
export function DetailsForm({
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
