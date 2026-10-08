/**
 * Length parsing and formatting (docs/0045, docs/0046). Part of the headless editor core:
 * no React, DOM or SVG imports allowed here (docs/0052, enforced by ESLint).
 *
 * Storage and API values are always integer millimetres (docs/0029).
 */

export type DisplayUnit = "mm" | "cm" | "m";

const MM_PER: Record<DisplayUnit, number> = { mm: 1, cm: 10, m: 1000 };

/**
 * Parse user input such as "350", "350cm", "3.5 m" or "3500mm" into integer millimetres.
 * A bare number is read in the user's display unit. Returns null for invalid input.
 */
export function parseLength(input: string, displayUnit: DisplayUnit): number | null {
  const match = /^\s*(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*$/i.exec(input);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(",", "."));
  const unit = (match[2]?.toLowerCase() as DisplayUnit | undefined) ?? displayUnit;
  return Math.round(value * MM_PER[unit]);
}

/** Format integer millimetres for display, always with the unit (docs/0046). */
export function formatLength(mm: number, displayUnit: DisplayUnit): string {
  switch (displayUnit) {
    case "mm":
      return `${mm} mm`;
    case "cm":
      return `${trimZeros((mm / 10).toFixed(1))} cm`;
    case "m":
      return `${(mm / 1000).toFixed(2)} m`;
  }
}

/** Decidegrees (storage) to degrees with one decimal (display). */
export function formatAngle(ddeg: number): string {
  return `${trimZeros((ddeg / 10).toFixed(1))}°`;
}

function trimZeros(s: string): string {
  return s.replace(/\.0$/, "");
}
