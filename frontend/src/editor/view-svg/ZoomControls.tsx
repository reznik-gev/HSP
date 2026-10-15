/** Zoom in, zoom out and fit-to-floor buttons over a plan canvas, plus the canvas size hook. */
import { Maximize, Minus, Plus } from "lucide-react";
import { type RefObject, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { planBounds } from "@/editor/core/fromApi";
import type { EditorStore } from "@/editor/core/store";
import { fitRect, zoomAt } from "@/editor/core/viewport";

/** The element's size in CSS px, or null before the first layout. */
export function useElementSize(ref: RefObject<HTMLElement | null>): [number, number] | null {
  const [size, setSize] = useState<[number, number] | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setSize([e.contentRect.width, e.contentRect.height]);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Shows the whole floor with a margin. */
export function fitPlan(store: EditorStore, size: [number, number]): void {
  const plan = store.getState().plan;
  const bounds = plan && planBounds(plan);
  if (bounds) store.getState().setViewport(fitRect(bounds, size, 48));
}

export function ZoomControls({
  store,
  size,
}: {
  store: EditorStore;
  size: [number, number] | null;
}) {
  const { t } = useTranslation();
  const zoom = (factor: number) => {
    if (!size) return;
    const s = store.getState();
    s.setViewport(zoomAt(s.viewport, size, size[0] / 2, size[1] / 2, factor));
  };
  return (
    <div className="absolute end-3 top-3 flex flex-col overflow-hidden rounded-md border bg-card shadow-sm">
      <Button variant="ghost" size="icon" aria-label={t("plan.zoomIn")} onClick={() => zoom(1.4)}>
        <Plus aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("plan.zoomOut")}
        onClick={() => zoom(1 / 1.4)}
      >
        <Minus aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("plan.fit")}
        onClick={() => size && fitPlan(store, size)}
      >
        <Maximize aria-hidden />
      </Button>
    </div>
  );
}
