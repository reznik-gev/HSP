/**
 * Seat numbering (docs/0049, docs/0092 step 6): a pattern with one counter in braces, e.g.
 * `HT-3-{01}` → HT-3-01, HT-3-02, …; the digits in the braces give the first number and how
 * many digits to pad to. Labels are unique per building (docs/0034): any label already taken,
 * on another floor or by another seat here, is skipped.
 */
import { isSeat } from "./fromApi";
import { hitTest } from "./hitTest";
import type { HitIndex } from "./hitTest";
import type { Plan, Vec2 } from "./plan";

export interface Pattern {
  before: string;
  after: string;
  start: number;
  width: number;
}

const COUNTER = /\{(\d{1,6})\}/;

/** Reads a pattern; null without exactly one `{digits}` counter. */
export function parsePattern(pattern: string): Pattern | null {
  const m = COUNTER.exec(pattern);
  if (!m || (pattern.match(/\{/g) ?? []).length !== 1) return null;
  return {
    before: pattern.slice(0, m.index),
    after: pattern.slice(m.index + m[0].length),
    start: Number(m[1]),
    width: m[1]!.length,
  };
}

export function labelFor(p: Pattern, n: number): string {
  return `${p.before}${String(n).padStart(p.width, "0")}${p.after}`;
}

/** The first label at or after counter `n` that isn't taken, and its counter. */
export function nextFree(
  p: Pattern,
  n: number,
  taken: ReadonlySet<string>,
): { label: string; n: number } {
  let i = n;
  while (taken.has(labelFor(p, i)) && i < n + 100_000) i++;
  return { label: labelFor(p, i), n: i };
}

/** Labels used on this floor by seats other than `except`. */
export function floorLabels(plan: Plan, except: ReadonlySet<string> = new Set()): Set<string> {
  const labels = new Set<string>();
  for (const id of plan.objectOrder) {
    const o = plan.objects[id];
    if (o?.label && !except.has(id) && isSeat(plan, id)) labels.add(o.label);
  }
  return labels;
}

/** The seat under a point: a seat itself, or the seat something is attached to. */
export function seatAt(plan: Plan, index: HitIndex, p: Vec2, tolerance: number): string | null {
  const hit = hitTest(plan, index, p, tolerance);
  if (hit?.kind !== "object") return null;
  if (isSeat(plan, hit.id)) return hit.id;
  const host = plan.objects[hit.id]?.attached_to;
  return host && isSeat(plan, host) ? host : null;
}
