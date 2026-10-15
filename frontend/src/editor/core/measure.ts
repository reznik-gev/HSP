/**
 * Typed measurements (docs/0045, docs/0092 step 3): "350", "3.5m" or "350<90" typed while
 * drawing or moving. A length is read in the user's display unit unless it has its own
 * (docs/0046); an angle is in degrees, anticlockwise from east (+x), like rotations.
 */
import type { Vec2 } from "./plan";
import { type DisplayUnit, parseAngle, parseLength } from "./units";

export interface Measure {
  lengthMm: number;
  /** Decidegrees, or null to keep the current direction. */
  angleDdeg: number | null;
}

/**
 * Reads a length and an optional angle. The angle comes from its own field, or after a "<" in
 * the length ("350<90"). Returns null for anything else, or a length that isn't positive.
 */
export function parseMeasure(length: string, angle: string, unit: DisplayUnit): Measure | null {
  const [lengthText = "", inlineAngle] = length.split("<");
  const lengthMm = parseLength(lengthText, unit);
  if (lengthMm === null || lengthMm <= 0) return null;
  const angleText = (inlineAngle ?? angle).trim();
  if (!angleText) return { lengthMm, angleDdeg: null };
  const angleDdeg = parseAngle(angleText);
  return angleDdeg === null ? null : { lengthMm, angleDdeg };
}

/**
 * The point `lengthMm` from `from`: at `angleDdeg`, or towards `toward` (the pointer) when no
 * angle was typed; east if the pointer is right on `from`. Whole millimetres (docs/0029).
 */
export function measuredPoint(from: Vec2, toward: Vec2, m: Measure): Vec2 {
  let ux: number;
  let uy: number;
  if (m.angleDdeg !== null) {
    const r = (m.angleDdeg * Math.PI) / 1800;
    ux = Math.cos(r);
    uy = Math.sin(r);
  } else {
    const len = Math.hypot(toward[0] - from[0], toward[1] - from[1]);
    [ux, uy] = len ? [(toward[0] - from[0]) / len, (toward[1] - from[1]) / len] : [1, 0];
  }
  return [Math.round(from[0] + ux * m.lengthMm), Math.round(from[1] + uy * m.lengthMm)];
}
