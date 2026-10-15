/**
 * The Problems tab (docs/0090): what the editor's own checks find right now (docs/0051), which
 * goes away once fixed, then what the server refused, newest first, which × dismisses.
 * Clicking one selects its element and brings it into view. Messages are translated by code,
 * with the server's English as a fallback.
 */
import { OctagonX, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import type { Interaction } from "@/editor/core/interaction";
import type { Plan } from "@/editor/core/plan";
import type { EditorStore } from "@/editor/core/store";

/** "Wall", "Seat A-04", "Meeting room 2"…, or null when the element is gone. */
function useElementName() {
  const { t } = useTranslation();
  return (plan: Plan | null, id: string | null): string | null => {
    if (!plan || !id) return null;
    if (plan.walls.some((w) => w.id === id)) return t("editor.props.kinds.wall", { count: 1 });
    const opening = plan.openings.find((o) => o.id === id);
    if (opening) return t(`editor.props.openingTypeOptions.${opening.type}`);
    if (plan.columns?.some((c) => c.id === id)) return t("editor.props.kinds.column", { count: 1 });
    const zone = plan.zones.find((z) => z.id === id);
    if (zone) return zone.name;
    const obj = plan.objects[id];
    if (!obj) return null;
    if (obj.label) return t("editor.problems.seat", { label: obj.label });
    return t("editor.props.kinds.object", { count: 1 });
  };
}

export function ProblemsPanel({
  store,
  interaction,
}: {
  store: EditorStore;
  interaction: Interaction;
}) {
  const { t } = useTranslation();
  const refused = useStore(store, (s) => s.problems);
  const findings = useStore(store, (s) => s.findings);
  const problems = [
    ...findings.map((f) => ({
      id: `live:${f.code}:${f.elementId}`,
      severity: f.severity,
      code: f.code,
      message: "",
      elementId: f.elementId,
      live: true,
    })),
    ...[...refused].reverse().map((p) => ({ ...p, live: false })),
  ];
  const plan = useStore(store, (s) => s.plan);
  const nameOf = useElementName();
  if (!problems.length) {
    return <p className="p-4 text-sm text-muted-foreground">{t("editor.problems.none")}</p>;
  }
  return (
    <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
      {problems.map((p) => {
        const name = nameOf(plan, p.elementId);
        const Icon = p.severity === "error" ? OctagonX : TriangleAlert;
        return (
          <li key={p.id} className="flex items-start gap-2 px-3 py-2.5">
            <Icon
              aria-label={t(`editor.problems.${p.severity}`)}
              className={
                p.severity === "error"
                  ? "mt-0.5 size-4 shrink-0 text-destructive"
                  : "mt-0.5 size-4 shrink-0 text-amber-500"
              }
            />
            <button
              type="button"
              className="min-w-0 flex-1 text-start text-sm hover:underline disabled:no-underline"
              disabled={!name}
              onClick={() => p.elementId && interaction.focus(p.elementId)}
            >
              <span className="block">
                {t(`editor.problems.codes.${p.code}`, { defaultValue: p.message || p.code })}
              </span>
              <span className="block text-xs text-muted-foreground">
                {name ?? t("editor.problems.gone")}
              </span>
            </button>
            {!p.live && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t("editor.problems.dismiss")}
                onClick={() => store.getState().dismissProblem(p.id)}
              >
                <X aria-hidden />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
