/**
 * What the editor draws over the plan (docs/0089): selected walls with handles on their ends,
 * the wall being drawn, a junction being dragged, and the snap marker. Plan millimetres inside
 * PlanView's y-up group; sizes meant in screen pixels are scaled by the zoom.
 */
import { useStore } from "zustand";

import type { Vec2 } from "@/editor/core/plan";
import type { EditorStore } from "@/editor/core/store";

export function EditOverlay({ store }: { store: EditorStore }) {
  const plan = useStore(store, (s) => s.plan);
  const selection = useStore(store, (s) => s.selection);
  const preview = useStore(store, (s) => s.preview);
  const px = useStore(store, (s) => s.viewport.mmPerPx);
  const thickness = useStore(store, (s) => s.wallDefaults.thickness_mm);
  if (!plan) return null;

  const selectedWalls = plan.walls.filter((w) => selection.has(w.id));
  const junction = preview?.kind === "junction" ? preview : null;
  const moved = (p: Vec2): Vec2 =>
    junction && p[0] === junction.from[0] && p[1] === junction.from[1] ? junction.to : p;

  return (
    <g pointerEvents="none" data-testid="edit-overlay">
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
      {preview && preview.snap === "endpoint" && (
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
      {preview?.kind === "wall" && (
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
