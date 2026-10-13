/**
 * Imports (docs/0084, docs/0085, docs/0088 choice 7): teams, people and seat assignments from
 * CSV or Excel. Upload, read the preview (nothing changes yet), then Apply the same file. All or
 * nothing: a file with errors applies nothing, and every problem is listed by row and column.
 * Admins only.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Download, FileUp } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { ApiProblem, asProblem, problemMessage } from "@/api/problems";
import { Page } from "@/app/Page";
import { useIsAdmin } from "@/auth/admin";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

import { downloadTemplate, IMPORT_KINDS, type ImportKind } from "./templates";

type Report = components["schemas"]["ImportReport"];

const route = getRouteApi("/shell/imports");

const PATHS = {
  units: "/api/v1/imports/units",
  people: "/api/v1/imports/people",
  seats: "/api/v1/imports/seat-assignments",
} as const;

async function upload(kind: ImportKind, file: File, apply: boolean): Promise<Report> {
  const form = new FormData();
  form.append("file", file);
  const { data, error } = await api.POST(PATHS[kind], {
    params: { query: { apply } },
    body: { file: "" },
    bodySerializer: () => form,
  });
  if (error || !data) throw new ApiProblem(asProblem(error));
  return data;
}

export function ImportsPage() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const { kind = "people" } = route.useSearch();
  const navigate = useNavigate({ from: "/imports" });
  if (!isAdmin) {
    return (
      <Page title={t("imports.title")}>
        <p className="text-muted-foreground">{t("imports.adminsOnly")}</p>
      </Page>
    );
  }
  return (
    <Page title={t("imports.title")}>
      <div role="tablist" aria-label={t("imports.what")} className="flex gap-1 border-b">
        {IMPORT_KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={k === kind}
            onClick={() => void navigate({ search: { kind: k }, replace: true })}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm",
              k === kind
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`imports.kinds.${k}.title`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-6">
        <Importer key={kind} kind={kind} />
      </div>
    </Page>
  );
}

function Importer({ kind }: { kind: ImportKind }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: ({ f, apply }: { f: File; apply: boolean }) => upload(kind, f, apply),
    onSuccess: (r) => {
      setReport(r);
      setFailure(null);
      if (r.applied) {
        for (const key of [["org-units"], ["people"], ["seats"], ["seat-search"], ["occupancy"]]) {
          void client.invalidateQueries({ queryKey: key });
        }
        notify(t("imports.appliedNotice", { file: file?.name ?? "" }));
      }
    },
    onError: (e) => {
      setReport(null);
      setFailure(problemMessage(asProblem(e), t("common.failed")));
    },
  });

  const choose = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setReport(null);
    run.mutate({ f, apply: false }); // preview straight away
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <p className="max-w-prose text-muted-foreground">{t(`imports.kinds.${kind}.explain`)}</p>
        <Button variant="outline" size="sm" onClick={() => downloadTemplate(kind)}>
          <Download aria-hidden />
          {t("imports.template")}
        </Button>
      </div>

      <label
        htmlFor={inputId}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files[0]);
        }}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed bg-card px-6 py-8 text-center hover:border-primary"
      >
        <FileUp className="size-6 text-muted-foreground" aria-hidden />
        <span className="font-medium">{file ? file.name : t("imports.choose")}</span>
        <span className="text-xs text-muted-foreground">{t("imports.formats")}</span>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept=".csv,.xlsx"
          className="sr-only"
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = ""; // choosing the same file again re-runs the preview
          }}
        />
      </label>

      {run.isPending && <p role="status">{t("imports.checking")}</p>}
      {failure && (
        <p role="alert" className="text-destructive">
          {failure}
        </p>
      )}
      {report && file && (
        <ReportView
          report={report}
          applying={run.isPending}
          onApply={() => run.mutate({ f: file, apply: true })}
        />
      )}
    </div>
  );
}

function ReportView({
  report,
  applying,
  onApply,
}: {
  report: Report;
  applying: boolean;
  onApply: () => void;
}) {
  const { t, i18n } = useTranslation();
  const n = new Intl.NumberFormat(i18n.resolvedLanguage);
  const counts = (
    [
      ["created", report.created],
      ["updated", report.updated],
      ["unchanged", report.unchanged],
      ["reactivated", report.reactivated],
      ["positionsCreated", report.positions_created],
    ] as const
  )
    // With errors nothing is decided yet, so only the row count means anything.
    .filter(([key, value]) => !report.errors.length && (value > 0 || key === "created"));
  const errors = report.errors;
  return (
    <section aria-labelledby="import-result" className="space-y-4">
      <h2 id="import-result" className="text-base font-semibold">
        {report.applied
          ? t("imports.applied")
          : errors.length
            ? t("imports.hasErrors", { count: errors.length })
            : t("imports.preview")}
      </h2>
      <dl className="tabular flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("imports.counts.rows")}</dt>
          <dd className="text-lg font-semibold">{n.format(report.rows)}</dd>
        </div>
        {counts.map(([key, value]) => (
          <div key={key}>
            <dt className="text-muted-foreground">
              {t(report.applied ? `imports.counts.${key}` : `imports.counts.${key}Preview`)}
            </dt>
            <dd className="text-lg font-semibold">{n.format(value)}</dd>
          </div>
        ))}
      </dl>
      {report.warnings.map((w) => (
        <p key={w} className="text-sm text-muted-foreground">
          {w}
        </p>
      ))}
      {errors.length > 0 ? (
        <>
          <p className="text-sm">{t("imports.fixAndRetry")}</p>
          <table className="w-full border-collapse overflow-hidden rounded-md border bg-card text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="w-16 px-3 py-2 text-start font-normal">
                  {t("imports.columns.row")}
                </th>
                <th scope="col" className="w-48 px-3 py-2 text-start font-normal">
                  {t("imports.columns.column")}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-normal">
                  {t("imports.columns.problem")}
                </th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="tabular px-3 py-2">{n.format(e.row)}</td>
                  <td className="px-3 py-2" dir="ltr">
                    <code className="text-xs">{e.column ?? "–"}</code>
                  </td>
                  <td className="px-3 py-2">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        !report.applied && (
          <Button onClick={onApply} disabled={applying}>
            {applying ? t("common.saving") : t("imports.apply")}
          </Button>
        )
      )}
    </section>
  );
}
