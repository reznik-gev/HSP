/**
 * The editor's grid, under the plan (docs/0047): fine lines at the snapping step and stronger
 * ones every metre, each shown only while far enough apart on screen to be useful, so the
 * grid thins out as you zoom out instead of turning grey.
 */
import { useStore } from "zustand";

import type { EditorStore } from "@/editor/core/store";

/** Lines closer than this on screen aren't drawn. */
const MIN_GAP_PX = 6;
/** Large enough to cover any floor, in mm. */
const EXTENT = 1_000_000;

export function GridUnderlay({ store }: { store: EditorStore }) {
  const gridMm = useStore(store, (s) => s.gridMm);
  const px = useStore(store, (s) => s.viewport.mmPerPx);
  const layers = [
    { id: "grid-minor", step: gridMm, opacity: 0.35 },
    { id: "grid-major", step: 1000, opacity: 0.7 },
  ].filter((l) => l.step / px >= MIN_GAP_PX && (l.id === "grid-major" || l.step < 1000));
  if (!layers.length) return null;
  return (
    <g pointerEvents="none" data-testid="grid">
      <defs>
        {layers.map((l) => (
          <pattern
            key={l.id}
            id={l.id}
            patternUnits="userSpaceOnUse"
            width={l.step}
            height={l.step}
          >
            <path
              d={`M${l.step} 0L0 0 0 ${l.step}`}
              fill="none"
              stroke="var(--border)"
              strokeOpacity={l.opacity}
              strokeWidth={px}
            />
          </pattern>
        ))}
      </defs>
      {layers.map((l) => (
        <rect
          key={l.id}
          x={-EXTENT}
          y={-EXTENT}
          width={2 * EXTENT}
          height={2 * EXTENT}
          fill={`url(#${l.id})`}
        />
      ))}
    </g>
  );
}
