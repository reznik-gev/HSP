/**
 * A plan filling its box, as both the floor viewer and the editor show it (docs/0042,
 * docs/0087, docs/0089): the SVG view, the zoom buttons, and an initial view that fits the
 * floor whenever a plan is loaded into the store and once the box has a size. `fitKey` asks
 * for another fit (e.g. a new seat to show); `fit` can choose a different initial view.
 * Anything else drawn over the canvas (tooltips, a legend, tool options) comes in as children.
 */
import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import { useStore } from "zustand";

import type { EditorStore } from "@/editor/core/store";
import { cn } from "@/lib/utils";

import { PlanView, type PlanViewProps, type RenderOptions } from "./PlanView";
import { fitPlan, useElementSize, ZoomControls } from "./ZoomControls";

/** How every page draws the plan. */
export const PLAN_OPTIONS: RenderOptions = {
  labels: true,
  hatching: false,
  doorArcs: true,
  zoneFills: true,
  lod: true,
};

export function PlanCanvas({
  store,
  fitKey,
  fit = fitPlan,
  view,
  children,
  className,
  ...box
}: {
  store: EditorStore;
  /** Fits again when this changes (compared by identity), besides on every loaded plan. */
  fitKey?: unknown;
  /** Sets the initial view for a canvas of `size`; fits the whole floor by default. */
  fit?: (store: EditorStore, size: [number, number]) => void;
  view: Omit<PlanViewProps, "store" | "options">;
  children?: ReactNode;
} & Omit<ComponentProps<"div">, "children" | "ref">) {
  const canvas = useRef<HTMLDivElement>(null);
  const size = useElementSize(canvas);
  const loaded = useStore(store, (s) => s.generation);

  useEffect(() => {
    if (size && loaded) fit(store, size);
    // Fit for a new plan or key and once the canvas has a size, not on every resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, loaded, fitKey, size === null]);

  return (
    <div ref={canvas} className={cn("relative min-w-0 flex-1", className)} {...box}>
      <PlanView store={store} options={PLAN_OPTIONS} {...view} />
      <ZoomControls store={store} size={size} />
      {children}
    </div>
  );
}
