/**
 * Plan operations (docs/0036, docs/0050): every edit is a list of add / update / delete
 * operations on the plan as the API shapes it, the same operations a changeset sends to the
 * server (docs/0081). Applying them also returns their inverse, which is how undo works.
 * Pure functions: no store, view or network code (docs/0052).
 */
import type { components } from "@/api/schema";

export type ApiPlan = components["schemas"]["Plan"];
export type Kind = "wall" | "opening" | "column" | "zone" | "object";
/** An element's API fields, without its id. */
export type ElementData = Record<string, unknown>;

export type Op =
  | { op: "add"; kind: Kind; id: string; data: ElementData }
  | { op: "update"; kind: Kind; id: string; data: ElementData }
  | { op: "delete"; kind: Kind; id: string };

const LIST = {
  wall: "walls",
  opening: "openings",
  column: "columns",
  zone: "zones",
  object: "objects",
} as const satisfies Record<Kind, keyof ApiPlan>;

type Element = { id: string } & ElementData;

function list(plan: ApiPlan, kind: Kind): Element[] {
  return plan[LIST[kind]];
}

function withoutId(element: Element): ElementData {
  const data: ElementData = { ...element };
  delete data.id;
  return data;
}

/**
 * Applies `ops` in order and returns the new plan plus the operations that undo them (in the
 * order to apply them). Throws on an operation that doesn't fit the plan: that's a bug in the
 * tool that made it, not a user error.
 */
export function applyOps(plan: ApiPlan, ops: readonly Op[]): { plan: ApiPlan; inverse: Op[] } {
  const lists = new Map<Kind, Element[]>();
  const editable = (kind: Kind) => {
    let l = lists.get(kind);
    if (!l) lists.set(kind, (l = [...list(plan, kind)]));
    return l;
  };
  const inverse: Op[] = [];
  for (const op of ops) {
    const items = editable(op.kind);
    const at = items.findIndex((e) => e.id === op.id);
    if (op.op === "add") {
      if (at >= 0) throw new Error(`add: ${op.kind} ${op.id} already exists`);
      items.push({ ...op.data, id: op.id });
      inverse.push({ op: "delete", kind: op.kind, id: op.id });
      continue;
    }
    const current = items[at];
    if (!current) throw new Error(`${op.op}: no ${op.kind} ${op.id}`);
    if (op.op === "delete") {
      items.splice(at, 1);
      inverse.push({ op: "add", kind: op.kind, id: op.id, data: withoutId(current) });
    } else {
      const before = Object.fromEntries(Object.keys(op.data).map((k) => [k, current[k] ?? null]));
      items[at] = { ...current, ...op.data };
      inverse.push({ op: "update", kind: op.kind, id: op.id, data: before });
    }
  }
  const next = { ...plan };
  for (const [kind, items] of lists) Object.assign(next, { [LIST[kind]]: items });
  return { plan: next, inverse: inverse.reverse() };
}

/** A new element id: UUIDv7, so ids sort by creation time (docs/0035). */
export function newId(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  for (let i = 0; i < 6; i++) bytes[i] = Math.floor(now / 2 ** (8 * (5 - i))) & 0xff;
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 9562 variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
