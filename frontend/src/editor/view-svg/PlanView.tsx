/**
 * SVG view of a floor plan (docs/0042, docs/0052). A THIN view: it renders the store and
 * forwards raw pointer/wheel input to the headless core (`Interaction`); it never decides what
 * was hit or how things move.
 *
 * Performance structure (docs/0042 mitigations):
 * - Everything is drawn in plan millimetres inside one y-flip group; pan/zoom only changes the
 *   root viewBox, so no plan element re-renders while panning or zooming.
 * - The static layer is memoized on plan identity: selection and dragging never re-render it.
 * - Selected elements are hidden in the static layer by a generated ID stylesheet and redrawn
 *   in the selection layer, whose group carries the drag offset as a single transform.
 * - Pointer events are disabled on drawn shapes; hit-testing is geometric, in the core.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import { type Interaction } from "@/editor/core/interaction";
import {
  type CatalogItem,
  catalogItemOf,
  type Opening,
  type Plan,
  type PlacedObject,
  type Wall,
} from "@/editor/core/plan";
import type { EditorStore } from "@/editor/core/store";
import { viewBox } from "@/editor/core/viewport";
import { wallChains } from "@/editor/core/walls";

export interface RenderOptions {
  labels: boolean;
  hatching: boolean;
  doorArcs: boolean;
  zoneFills: boolean;
  /** Level of detail: hide labels and monitors when zoomed far out. */
  lod: boolean;
}

export interface PlanViewProps {
  store: EditorStore;
  interaction: Interaction;
  options: RenderOptions;
  /** Called after the static layer for a new plan has been painted (initial render timing). */
  onStaticPainted?: () => void;
  /** Called after a pointer-down that changed the selection has been painted. */
  onSelectionPainted?: (sinceDownMs: number) => void;
}

const LOD_MM_PER_PX = 30;
const WALL_COLOR = "#44403c";

/** Run `fn` after the next paint (rAF fires before paint; the timeout lands after it). */
function afterPaint(fn: () => void): void {
  requestAnimationFrame(() => setTimeout(fn, 0));
}

export function PlanView({
  store,
  interaction,
  options,
  onStaticPainted,
  onSelectionPainted,
}: PlanViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<[number, number]>([1, 1]);
  const plan = useStore(store, (s) => s.plan);
  const viewport = useStore(store, (s) => s.viewport);
  const downAt = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      interaction.setSize(width, height);
      setSize([width, height]);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [interaction]);

  // Wheel must be non-passive to prevent page scroll.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      interaction.wheel(e.clientX - r.left, e.clientY - r.top, e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [interaction]);

  const toInput = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top, button: e.button, shift: e.shiftKey };
  };

  const [vx, vy, vw, vh] = viewBox(viewport, size);
  const far = options.lod && viewport.mmPerPx > LOD_MM_PER_PX;

  return (
    <svg
      ref={svgRef}
      className="h-full w-full touch-none select-none bg-white"
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      data-lod={far ? "far" : "near"}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        downAt.current = performance.now();
        const what = interaction.pointerDown(toInput(e));
        if (what !== "select") downAt.current = null;
      }}
      onPointerMove={(e) => interaction.pointerMove(toInput(e))}
      onPointerUp={(e) => interaction.pointerUp(toInput(e))}
      onContextMenu={(e) => e.preventDefault()}
      // Middle-button pans; stop Chrome's middle-click autoscroll from taking over.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
    >
      <style>{`
        svg[data-lod="far"] .lod-detail { display: none; }
        .plan * { pointer-events: none; }
      `}</style>
      <defs>
        <pattern
          id="wall-hatch"
          patternUnits="userSpaceOnUse"
          width="120"
          height="120"
          patternTransform="rotate(45)"
        >
          <rect width="120" height="120" fill="#d6d3d1" />
          <line x1="0" y1="0" x2="0" y2="120" stroke={WALL_COLOR} strokeWidth="40" />
        </pattern>
      </defs>
      <g className="plan" transform="scale(1,-1)">
        {plan && <StaticLayer plan={plan} options={options} onPainted={onStaticPainted} />}
        {plan && (
          <SelectionLayer
            store={store}
            plan={plan}
            options={options}
            onPainted={() => {
              if (downAt.current !== null && onSelectionPainted) {
                onSelectionPainted(performance.now() - downAt.current);
              }
              downAt.current = null;
            }}
          />
        )}
      </g>
    </svg>
  );
}

// --- Static layer ----------------------------------------------------------------------------

const StaticLayer = memo(function StaticLayer({
  plan,
  options,
  onPainted,
}: {
  plan: Plan;
  options: RenderOptions;
  onPainted: (() => void) | undefined;
}) {
  useLayoutEffect(() => {
    if (onPainted) afterPaint(onPainted);
    // Only a new plan or new render options count as a fresh static paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, options]);

  const chains = useMemo(() => wallChains(plan.walls), [plan.walls]);
  const wallsById = useMemo(() => new Map(plan.walls.map((w) => [w.id, w])), [plan.walls]);

  return (
    <g>
      {options.zoneFills && (
        <g>
          {plan.zones.map((z) => (
            <polygon
              key={z.id}
              points={z.boundary.map((p) => `${p[0]},${p[1]}`).join(" ")}
              fill={z.color}
              fillOpacity={0.25}
              stroke={z.color}
              strokeWidth={30}
            />
          ))}
        </g>
      )}
      <g>
        {chains.map((c, i) => (
          <path
            key={i}
            d={`M${c.points.map((p) => `${p[0]} ${p[1]}`).join(" L")}${c.closed ? " Z" : ""}`}
            fill="none"
            stroke={options.hatching ? "url(#wall-hatch)" : WALL_COLOR}
            strokeWidth={c.thickness_mm}
            strokeLinejoin="miter"
            strokeLinecap="butt"
          />
        ))}
      </g>
      <g>
        {plan.openings.map((o) => {
          const w = wallsById.get(o.wall_id);
          return w ? <Door key={o.id} opening={o} wall={w} arcs={options.doorArcs} /> : null;
        })}
      </g>
      <g>
        {plan.objectOrder.map((id) => {
          const obj = plan.objects[id];
          return obj ? <ObjectShape key={id} item={catalogItemOf(plan, obj)} obj={obj} /> : null;
        })}
      </g>
      {options.labels && (
        <g className="lod-detail">
          {plan.objectOrder.map((id) => {
            const obj = plan.objects[id];
            return obj?.label ? <Label key={id} obj={obj} /> : null;
          })}
        </g>
      )}
    </g>
  );
});

/** Props are the object and its catalog item (not the whole plan), so after a move only the
 *  changed objects re-render. `highlight` marks a selection-layer copy, which carries no DOM id
 *  (the hide-selected stylesheet targets the static originals by id). */
const ObjectShape = memo(function ObjectShape({
  item,
  obj,
  highlight = false,
}: {
  item: CatalogItem;
  obj: PlacedObject;
  highlight?: boolean;
}) {
  const domId = highlight ? undefined : `e-${obj.id}`;
  const transform = `translate(${obj.position[0]} ${obj.position[1]}) rotate(${obj.rotation_ddeg / 10})`;
  const stroke = highlight ? "#2563eb" : "#78716c";
  const strokeWidth = highlight ? 40 : 12;
  const detail = item.category === "monitor" ? "lod-detail" : undefined;
  if (item.shape === "cylinder") {
    return (
      <circle
        id={domId}
        className={detail}
        transform={transform}
        r={item.width_mm / 2}
        fill={item.color}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  return (
    <rect
      id={`e-${obj.id}`}
      className={detail}
      transform={transform}
      x={-item.width_mm / 2}
      y={-item.depth_mm / 2}
      width={item.width_mm}
      height={item.depth_mm}
      fill={item.color}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
});

const Label = memo(function Label({ obj, copy = false }: { obj: PlacedObject; copy?: boolean }) {
  return (
    <text
      id={copy ? undefined : `l-${obj.id}`}
      transform={`translate(${obj.position[0]} ${obj.position[1]}) scale(1 -1)`}
      fontSize={180}
      fontFamily="system-ui, sans-serif"
      textAnchor="middle"
      dominantBaseline="central"
      fill="#1c1917"
    >
      {obj.label}
    </text>
  );
});

function Door({ opening, wall, arcs }: { opening: Opening; wall: Wall; arcs: boolean }) {
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) || 1;
  const ux = (wall.b[0] - wall.a[0]) / len;
  const uy = (wall.b[1] - wall.a[1]) / len;
  const sx = wall.a[0] + ux * opening.offset_mm;
  const sy = wall.a[1] + uy * opening.offset_mm;
  const ex = sx + ux * opening.width_mm;
  const ey = sy + uy * opening.width_mm;
  const hingeAtStart = opening.swing.startsWith("left");
  const inward = opening.swing.endsWith("_in") ? 1 : -1;
  const [hx, hy, fx, fy] = hingeAtStart ? [sx, sy, ex, ey] : [ex, ey, sx, sy];
  // Leaf: perpendicular to the wall at the hinge, length = door width.
  const nx = -uy * inward;
  const ny = ux * inward;
  const lx = hx + nx * opening.width_mm;
  const ly = hy + ny * opening.width_mm;
  const sweep = (hingeAtStart ? 1 : 0) ^ (inward === 1 ? 0 : 1);
  return (
    <g>
      {/* Gap in the wall */}
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#ffffff" strokeWidth={wall.thickness_mm + 4} />
      {opening.type === "door" && (
        <>
          <line x1={hx} y1={hy} x2={lx} y2={ly} stroke={WALL_COLOR} strokeWidth={30} />
          {arcs && (
            <path
              d={`M${lx} ${ly} A${opening.width_mm} ${opening.width_mm} 0 0 ${sweep} ${fx} ${fy}`}
              fill="none"
              stroke={WALL_COLOR}
              strokeWidth={12}
              strokeDasharray="60 40"
            />
          )}
        </>
      )}
    </g>
  );
}

// --- Selection layer -------------------------------------------------------------------------

function SelectionLayer({
  store,
  plan,
  options,
  onPainted,
}: {
  store: EditorStore;
  plan: Plan;
  options: RenderOptions;
  onPainted: () => void;
}) {
  const selection = useStore(store, (s) => s.selection);
  const drag = useStore(store, (s) => s.drag);

  useLayoutEffect(() => {
    afterPaint(onPainted);
    // Report once per selection change, not per drag frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const ids = [...selection];
  // Hide the originals in the static layer; they are redrawn (highlighted, offset) below.
  const hideCss = ids.map((id) => `#e-${id},#l-${id}`).join(",");
  const offset = drag ? `translate(${drag.dx} ${drag.dy})` : undefined;

  return (
    <>
      {ids.length > 0 && <style>{`${hideCss}{display:none}`}</style>}
      <g transform={offset}>
        {ids.map((id) => {
          const obj = plan.objects[id];
          return obj ? (
            <ObjectShape key={id} item={catalogItemOf(plan, obj)} obj={obj} highlight />
          ) : null;
        })}
        {options.labels &&
          ids.map((id) => {
            const obj = plan.objects[id];
            return obj?.label ? <Label key={`l${id}`} obj={obj} copy /> : null;
          })}
      </g>
    </>
  );
}
