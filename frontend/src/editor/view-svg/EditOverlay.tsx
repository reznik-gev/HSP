/**
 * What the editor draws over the plan (docs/0089): selected walls with handles on their ends,
 * selected doors, windows, columns and zones (zones with handles on their corners), what a
 * tool is about to place, a junction or zone corner being dragged, and the snap marker. Plan millimetres inside
 * PlanView's y-up group; sizes meant in screen pixels are scaled by the zoom.
 */
import { useStore } from "zustand";

import type { Vec2, Wall } from "@/editor/core/plan";
import type { EditorStore } from "@/editor/core/store";

export function EditOverlay({ store }: { store: EditorStore }) {
  const plan = useStore(store, (s) => s.plan);
  const selection = useStore(store, (s) => s.selection);
  const preview = useStore(store, (s) => s.preview);
  const px = useStore(store, (s) => s.viewport.mmPerPx);
  const thickness = useStore(store, (s) => s.wallDefaults.thickness_mm);
  const drag = useStore(store, (s) => s.drag);
  if (!plan) return null;
  const wallsById = new Map(plan.walls.map((w) => [w.id, w]));
  const opening = preview?.kind === "opening" ? preview : null;
  const vertex = preview?.kind === "vertex" ? preview : null;
  const zoneOutline = (id: string, boundary: readonly Vec2[]) =>
    vertex?.zone === id ? boundary.map((p, i) => (i === vertex.index ? vertex.to : p)) : boundary;
  const selectedZones = plan.zones.filter((z) => selection.has(z.id));

  const selectedWalls = plan.walls.filter((w) => selection.has(w.id));
  const junction = preview?.kind === "junction" ? preview : null;
  const moved = (p: Vec2): Vec2 =>
    junction && p[0] === junction.from[0] && p[1] === junction.from[1] ? junction.to : p;

  return (
    <g pointerEvents="none" data-testid="edit-overlay">
      {selectedZones.map((z) => (
        <polygon
          key={z.id}
          className="plan-selected"
          points={points(zoneOutline(z.id, z.boundary))}
          fill="var(--primary)"
          fillOpacity={0.12}
          strokeWidth={2 * px}
          data-selected-zone={z.id}
        />
      ))}
      {preview?.kind === "zone" && preview.points.length > 0 && (
        <polygon
          className="plan-selected"
          points={points([...preview.points, preview.to])}
          fill="var(--primary)"
          fillOpacity={0.12}
          strokeWidth={2 * px}
          strokeDasharray={`${6 * px} ${4 * px}`}
          data-testid="zone-preview"
        />
      )}
      {selectedWalls.map((w) => (
        <line
          key={w.id}
          className="plan-selected"
          x1={w.a[0]}
          y1={w.a[1]}
          x2={w.b[0]}
          y2={w.b[1]}
          strokeWidth={w.thickness_mm}
          strokeOpacity={0.35}
          data-selected-wall={w.id}
        />
      ))}
      {junction &&
        plan.walls
          .filter((w) => junction.walls.includes(w.id))
          .map((w) => {
            const [a, b] = [moved(w.a), moved(w.b)];
            return (
              <line
                key={`j${w.id}`}
                className="plan-selected"
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                strokeWidth={w.thickness_mm}
                strokeOpacity={0.6}
              />
            );
          })}
      {plan.openings
        .filter((o) => selection.has(o.id) && o.id !== opening?.id)
        .map((o) => {
          const w = wallsById.get(o.wall_id);
          return w ? <Span key={o.id} wall={w} offset={o.offset_mm} width={o.width_mm} /> : null;
        })}
      {opening?.wall_id && wallsById.get(opening.wall_id) && (
        <Span
          wall={wallsById.get(opening.wall_id)!}
          offset={opening.offset_mm}
          width={opening.width_mm}
          testId="opening-preview"
        />
      )}
      <g transform={drag ? `translate(${drag.dx} ${drag.dy})` : undefined}>
        {(plan.columns ?? [])
          .filter((c) => selection.has(c.id))
          .map((c) => (
            <polygon
              key={c.id}
              className="plan-selected"
              points={c.footprint.map((p) => `${p[0]},${p[1]}`).join(" ")}
              fill="var(--primary)"
              fillOpacity={0.35}
              strokeWidth={2 * px}
            />
          ))}
      </g>
      {preview?.kind === "column" && (
        <polygon
          className="plan-selected"
          points={preview.footprint.map((p) => `${p[0]},${p[1]}`).join(" ")}
          fill="var(--primary)"
          fillOpacity={0.3}
          strokeWidth={2 * px}
          data-testid="column-preview"
        />
      )}
      {selectedZones.flatMap((z) =>
        zoneOutline(z.id, z.boundary).map((p, i) => <Handle key={`${z.id}${i}`} at={p} px={px} />),
      )}
      {selectedWalls.flatMap((w) =>
        [moved(w.a), moved(w.b)].map((p, i) => <Handle key={`${w.id}${i}`} at={p} px={px} />),
      )}
      {preview?.kind === "wall" && preview.from && (
        <line
          className="plan-selected"
          x1={preview.from[0]}
          y1={preview.from[1]}
          x2={preview.to[0]}
          y2={preview.to[1]}
          strokeWidth={thickness}
          strokeOpacity={0.5}
          data-testid="wall-preview"
        />
      )}
      {preview && "snap" in preview && preview.snap === "endpoint" && "to" in preview && (
        <rect
          className="plan-selected"
          x={preview.to[0] - 6 * px}
          y={preview.to[1] - 6 * px}
          width={12 * px}
          height={12 * px}
          fill="none"
          strokeWidth={2 * px}
        />
      )}
      {(preview?.kind === "wall" || preview?.kind === "zone") && (
        <circle
          className="plan-selected"
          cx={preview.to[0]}
          cy={preview.to[1]}
          r={3 * px}
          fill="var(--primary)"
        />
      )}
    </g>
  );
}

const points = (ps: readonly Vec2[]) => ps.map((p) => `${p[0]},${p[1]}`).join(" ");

/** A stretch of a wall, e.g. a selected door or one about to be placed. */
function Span({
  wall,
  offset,
  width,
  testId,
}: {
  wall: Wall;
  offset: number;
  width: number;
  testId?: string;
}) {
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) || 1;
  const ux = (wall.b[0] - wall.a[0]) / len;
  const uy = (wall.b[1] - wall.a[1]) / len;
  return (
    <line
      className="plan-selected"
      x1={wall.a[0] + ux * offset}
      y1={wall.a[1] + uy * offset}
      x2={wall.a[0] + ux * (offset + width)}
      y2={wall.a[1] + uy * (offset + width)}
      strokeWidth={wall.thickness_mm + 60}
      strokeOpacity={0.5}
      data-testid={testId}
    />
  );
}

/** A draggable end of a selected wall. */
function Handle({ at, px }: { at: Vec2; px: number }) {
  return (
    <circle
      cx={at[0]}
      cy={at[1]}
      r={5 * px}
      fill="var(--plan-paper)"
      stroke="var(--primary)"
      strokeWidth={2 * px}
    />
  );
}
