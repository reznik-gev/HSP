/**
 * The height filter (docs/0095): All, Floor or Raised. The other group is faded, not hidden, so
 * the plan keeps its bearings. Shown only when the floor has raised items.
 */
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import type { HeightFilter } from "@/editor/core/heights";
import { isRaised } from "@/editor/core/heights";
import type { EditorStore } from "@/editor/core/store";
import { cn } from "@/lib/utils";

const FILTERS: HeightFilter[] = ["all", "floor", "raised"];

export function HeightFilterControl({ store }: { store: EditorStore }) {
  const { t } = useTranslation();
  const filter = useStore(store, (s) => s.heightFilter);
  const anyRaised = useStore(store, (s) =>
    Object.values(s.plan?.objects ?? {}).some((o) => isRaised(o)),
  );
  if (!anyRaised) return null;
  return (
    <div
      role="group"
      aria-label={t("plan.height.label")}
      className="absolute end-3 bottom-3 flex items-center gap-0.5 rounded-md border bg-card p-1 text-xs shadow-sm"
    >
      {FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={filter === f}
          onClick={() => store.getState().setHeightFilter(f)}
          className={cn(
            "h-7 rounded px-2 text-muted-foreground hover:bg-muted",
            filter === f && "bg-primary/10 text-primary hover:bg-primary/15",
          )}
        >
          {t(`plan.height.${f}`)}
        </button>
      ))}
    </div>
  );
}
