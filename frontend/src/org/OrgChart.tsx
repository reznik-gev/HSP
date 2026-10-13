/**
 * The read-only org chart (docs/0088 choices 3 and 11): boxes and lines in SVG, themed with our
 * tokens. Drag to pan, wheel or the buttons to zoom, Fit to see everything. Clicking a team opens
 * its panel. Each box is a link, so the chart works from the keyboard too.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Maximize, Minus, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import { type ChartLayout, layoutChart, linkPath, NODE_H, NODE_W } from "./chartLayout";
import { memberCountsQuery } from "./members";
import type { Unit } from "./units";

interface View {
  cx: number;
  cy: number;
  scale: number; // screen px per chart unit
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;

function fit(layout: ChartLayout, size: [number, number]): View {
  const { minX, minY, maxX, maxY } = layout.bounds;
  const margin = 32;
  const scale = Math.min(
    MAX_SCALE,
    (size[0] - 2 * margin) / Math.max(1, maxX - minX),
    (size[1] - 2 * margin) / Math.max(1, maxY - minY),
    1,
  );
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale: Math.max(MIN_SCALE, scale) };
}

export function OrgChart({ units, selected }: { units: Unit[]; selected: string | undefined }) {
  const { t, i18n } = useTranslation();
  const counts = useQuery(memberCountsQuery);
  const rtl = i18n.dir() === "rtl";
  const layout = useMemo(
    () => layoutChart(units, rtl, new Intl.Collator(i18n.resolvedLanguage)),
    [units, rtl, i18n.resolvedLanguage],
  );
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number] | null>(null);
  const [view, setView] = useState<View | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setSize([e.contentRect.width, e.contentRect.height]);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Fit once the size is known, and again whenever the chart itself changes.
  const [fittedFor, setFittedFor] = useState<ChartLayout | null>(null);
  if (size && fittedFor !== layout) {
    setFittedFor(layout);
    setView(fit(layout, size));
  }

  // Wheel zoom around the pointer; non-passive so the page doesn't scroll.
  useEffect(() => {
    const el = box.current;
    if (!el || !size) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) =>
        v
          ? zoomAt(v, size, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015))
          : v,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [size]);

  const zoomBy = (factor: number) =>
    size && setView((v) => (v ? zoomAt(v, size, size[0] / 2, size[1] / 2, factor) : v));

  const viewBox =
    view && size
      ? [
          view.cx - size[0] / 2 / view.scale,
          view.cy - size[1] / 2 / view.scale,
          size[0] / view.scale,
          size[1] / view.scale,
        ].join(" ")
      : "0 0 1 1";

  return (
    <div
      ref={box}
      className="relative h-[calc(100vh-15rem)] min-h-96 overflow-hidden rounded-md border bg-[var(--plan-paper)]"
    >
      <svg
        role="group"
        aria-label={t("org.chart")}
        direction="ltr"
        className="h-full w-full touch-none select-none"
        viewBox={viewBox}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !view) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) < 3) return;
          if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId);
          d.moved = true;
          d.x = e.clientX;
          d.y = e.clientY;
          setView({ ...view, cx: view.cx - dx / view.scale, cy: view.cy - dy / view.scale });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        // A drag that ends on a box must not open it.
        onClickCapture={(e) => {
          if (drag.current?.moved) e.preventDefault();
        }}
      >
        <g fill="none" stroke="var(--border)" strokeWidth={1.5}>
          {layout.links.map((l) => (
            <path key={`${l.from.unit.id}-${l.to.unit.id}`} d={linkPath(l)} />
          ))}
        </g>
        {layout.nodes.map(({ unit, x, y }) => {
          const isSelected = unit.id === selected;
          const count = counts.data?.get(unit.id) ?? 0;
          return (
            <Link
              key={unit.id}
              from="/org"
              search={(prev) => ({ ...prev, unit: unit.id, new: undefined })}
              aria-label={`${unit.name}, ${t("org.members", { count })}`}
              className="group outline-none"
            >
              <rect
                x={x - NODE_W / 2}
                y={y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill="var(--card)"
                stroke={isSelected ? "var(--primary)" : "var(--border)"}
                strokeWidth={isSelected ? 2.5 : 1}
                className="transition-[stroke] group-hover:stroke-[var(--primary)] group-focus-visible:stroke-[var(--ring)]"
              />
              <text
                x={x}
                y={y + 23}
                textAnchor="middle"
                // Text reads in the page's direction; only the geometry is fixed (mixed
                // Latin/Hebrew labels would otherwise come out jumbled).
                direction={rtl ? "rtl" : "ltr"}
                fill="var(--foreground)"
                fontSize={14}
                fontWeight={600}
                className="font-sans"
              >
                {truncate(unit.name, 22)}
              </text>
              <text
                x={x}
                y={y + 42}
                textAnchor="middle"
                direction={rtl ? "rtl" : "ltr"}
                fill="var(--muted-foreground)"
                fontSize={12}
                className="font-sans"
              >
                {[unit.level_label, t("org.members", { count })]
                  .filter(Boolean)
                  .map(isolate)
                  .join(" · ")}
              </text>
            </Link>
          );
        })}
      </svg>
      <div className="absolute end-3 top-3 flex flex-col overflow-hidden rounded-md border bg-card shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("plan.zoomIn")}
          onClick={() => zoomBy(1.4)}
        >
          <Plus aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("plan.zoomOut")}
          onClick={() => zoomBy(1 / 1.4)}
        >
          <Minus aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("org.fit")}
          onClick={() => size && setView(fit(layout, size))}
        >
          <Maximize aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function zoomAt(v: View, size: [number, number], sx: number, sy: number, factor: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
  // Keep the chart point under (sx, sy) fixed.
  const px = v.cx + (sx - size[0] / 2) / v.scale;
  const py = v.cy + (sy - size[1] / 2) / v.scale;
  return {
    scale,
    cx: px - (sx - size[0] / 2) / scale,
    cy: py - (sy - size[1] / 2) / scale,
  };
}

/** Unicode first-strong isolate: a part keeps its own direction, so "Team · 3 אנשים" doesn't
 * glue the number to the English word in Hebrew. */
function isolate(text: string | null): string {
  return `⁨${text ?? ""}⁩`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
