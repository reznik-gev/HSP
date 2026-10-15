/**
 * The panel on the end side of the editor (docs/0089 layout: right in English, left in Hebrew):
 * the catalog while the item tool is on, otherwise two tabs, Properties and Problems, with the
 * number of problems on the tab (docs/0090).
 */
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import type { Interaction } from "@/editor/core/interaction";
import type { EditorStore } from "@/editor/core/store";
import { cn } from "@/lib/utils";

import { ItemPicker } from "./ItemPicker";
import { ProblemsPanel } from "./problems/ProblemsPanel";
import { PropertiesPanel } from "./properties/PropertiesPanel";

const TABS = ["properties", "problems"] as const;
const PANEL = "flex w-72 shrink-0 flex-col border-s bg-card";

export function SidePanel({
  store,
  interaction,
}: {
  store: EditorStore;
  interaction: Interaction;
}) {
  const { t } = useTranslation();
  const tool = useStore(store, (s) => s.tool);
  const tab = useStore(store, (s) => s.panelTab);
  const refused = useStore(store, (s) => s.problems);
  const findings = useStore(store, (s) => s.findings);
  const problems = [...refused, ...findings];
  const errors = problems.some((p) => p.severity === "error");
  if (tool === "item") {
    return (
      <aside aria-label={t("editor.items.title")} className={PANEL}>
        <ItemPicker store={store} />
      </aside>
    );
  }
  return (
    <aside aria-label={t(`editor.panel.${tab}`)} className={PANEL}>
      <div role="tablist" className="flex shrink-0 border-b px-2">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`tab-${name}`}
            aria-selected={tab === name}
            aria-controls="side-panel-body"
            onClick={() => store.getState().setPanelTab(name)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground",
              tab === name && "border-primary text-foreground",
            )}
          >
            {t(`editor.panel.${name}`)}
            {name === "problems" && problems.length > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs leading-5 text-white tabular-nums",
                  errors ? "bg-destructive" : "bg-amber-500",
                )}
              >
                {problems.length}
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        id="side-panel-body"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {tab === "properties" ? (
          <PropertiesPanel store={store} />
        ) : (
          <ProblemsPanel store={store} interaction={interaction} />
        )}
      </div>
    </aside>
  );
}
