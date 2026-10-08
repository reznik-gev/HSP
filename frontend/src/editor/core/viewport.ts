/**
 * Pan/zoom maths (docs/0042: the SVG user unit is 1 mm; the viewBox implements pan and zoom).
 * Screen y grows downward; plan y grows upward (north), so the view flips y once.
 */
import type { Rect } from "./geometry";
import type { Vec2 } from "./plan";

export interface Viewport {
  /** Plan point shown at the centre of the screen. */
  cx: number;
  cy: number;
  /** Millimetres per CSS pixel (larger = zoomed out). */
  mmPerPx: number;
}

export const MIN_MM_PER_PX = 0.5;
export const MAX_MM_PER_PX = 500;

export function screenToPlan(v: Viewport, size: Vec2, sx: number, sy: number): Vec2 {
  return [v.cx + (sx - size[0] / 2) * v.mmPerPx, v.cy - (sy - size[1] / 2) * v.mmPerPx];
}

export function planToScreen(v: Viewport, size: Vec2, p: Vec2): Vec2 {
  return [(p[0] - v.cx) / v.mmPerPx + size[0] / 2, (v.cy - p[1]) / v.mmPerPx + size[1] / 2];
}

/** SVG viewBox in the flipped coordinate space (svg y = -plan y). */
export function viewBox(v: Viewport, size: Vec2): [number, number, number, number] {
  const w = size[0] * v.mmPerPx;
  const h = size[1] * v.mmPerPx;
  return [v.cx - w / 2, -(v.cy + h / 2), w, h];
}

export function panBy(v: Viewport, dxPx: number, dyPx: number): Viewport {
  return { ...v, cx: v.cx - dxPx * v.mmPerPx, cy: v.cy + dyPx * v.mmPerPx };
}

/** Zoom by `factor` (> 1 zooms in) keeping the plan point under the cursor fixed. */
export function zoomAt(v: Viewport, size: Vec2, sx: number, sy: number, factor: number): Viewport {
  const anchor = screenToPlan(v, size, sx, sy);
  const mmPerPx = Math.min(MAX_MM_PER_PX, Math.max(MIN_MM_PER_PX, v.mmPerPx / factor));
  const ratio = mmPerPx / v.mmPerPx;
  return {
    mmPerPx,
    cx: anchor[0] + (v.cx - anchor[0]) * ratio,
    cy: anchor[1] + (v.cy - anchor[1]) * ratio,
  };
}

export function fitRect(r: Rect, size: Vec2, marginPx = 24): Viewport {
  const w = Math.max(1, size[0] - 2 * marginPx);
  const h = Math.max(1, size[1] - 2 * marginPx);
  return {
    cx: (r.minX + r.maxX) / 2,
    cy: (r.minY + r.maxY) / 2,
    mmPerPx: Math.max((r.maxX - r.minX) / w, (r.maxY - r.minY) / h),
  };
}
