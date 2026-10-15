/**
 * The editing tools (docs/0089 layout): a vertical strip on the start side, left in English and
 * right in Hebrew. Each tool has a one-letter shortcut.
 */
import {
  AppWindow,
  Armchair,
  BrickWall,
  DoorOpen,
  Hash,
  MousePointer2,
  Square,
  SquareDashed,
} from "lucide-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import type { EditorStore, Tool } from "@/editor/core/store";
import { cn } from "@/lib/utils";

export const TOOLS: {
  tool: Tool;
  key: string;
  icon: ComponentType<{ "aria-hidden"?: boolean }>;
}[] = [
  { tool: "select", key: "V", icon: MousePointer2 },
  { tool: "wall", key: "W", icon: BrickWall },
  { tool: "door", key: "D", icon: DoorOpen },
  { tool: "window", key: "N", icon: AppWindow },
  { tool: "column", key: "C", icon: Square },
  { tool: "zone", key: "Z", icon: SquareDashed },
  { tool: "item", key: "P", icon: Armchair },
  { tool: "number", key: "L", icon: Hash },
];

export function ToolStrip({ store, disabled }: { store: EditorStore; disabled: boolean }) {
  const { t } = useTranslation();
  const current = useStore(store, (s) => s.tool);
  return (
    <div
      role="toolbar"
      aria-label={t("editor.tools.label")}
      aria-orientation="vertical"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-e bg-card py-2"
    >
      {TOOLS.map(({ tool, key, icon: Icon }) => (
        <button
          key={tool}
          type="button"
          disabled={disabled}
          aria-pressed={current === tool}
          aria-label={t(`editor.tools.${tool}`)}
          title={`${t(`editor.tools.${tool}`)} (${key})`}
          onClick={() => store.getState().setTool(tool)}
          className={cn(
            "flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 [&_svg]:size-4",
            current === tool && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
          )}
        >
          <Icon aria-hidden />
        </button>
      ))}
    </div>
  );
}
