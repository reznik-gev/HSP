/**
 * What the Properties panel shows and changes for a selection (docs/0045): a list of fields per
 * kind of element, each reading a value from the element (as the API shapes it) and turning a
 * new value into operations (docs/0050). Lengths are integer mm and angles decidegrees here;
 * the panel parses and formats them in the user's units (docs/0046). Pure, like the core.
 */
import { setWallLength } from "./edits";
import type { ApiPlan, Kind, Op } from "./operations";
import { polygonArea } from "./geometry";
import type { Plan, Vec2 } from "./plan";

/** An element of the document: its API fields plus the id. */
export type Element = { id: string } & Record<string, unknown>;

export type FieldKind = "length" | "angle" | "text" | "choice" | "area";

export interface Field {
  /** Also the translation key: editor.props.<key>. */
  key: string;
  kind: FieldKind;
  /** Choice values (labels are editor.props.<key>Options.<value>, or the given labels). */
  options?: readonly { value: string; label?: string }[];
  /** Shown but not editable. */
  readOnly?: boolean;
  get(el: Element): number | string | null;
  /** The ops that set the value on `el`, or null when the value isn't allowed. */
  set?(el: Element, value: number | string, ctx: Context): Op[] | null;
}

export interface Context {
  plan: Plan;
  document: ApiPlan;
}

export interface SelectionInfo {
  kind: Kind;
  elements: Element[];
  fields: Field[];
}

const LISTS: Record<Kind, keyof ApiPlan> = {
  wall: "walls",
  opening: "openings",
  column: "columns",
  zone: "zones",
  object: "objects",
};

const update = (kind: Kind, id: string, data: Record<string, unknown>): Op[] => [
  { op: "update", kind, id, data },
];
const positive = (v: number | string): v is number => typeof v === "number" && v > 0;
const vec = (v: unknown) => v as Vec2;
const len = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function wallOf(ctx: Context, id: unknown) {
  return ctx.plan.walls.find((w) => w.id === id);
}

/** A simple size field: a positive length stored under `key`. */
function size(kind: Kind, key: string, propsKey = key.replace(/_mm$/, "")): Field {
  return {
    key: propsKey,
    kind: "length",
    get: (el) => el[key] as number,
    set: (el, v) => (positive(v) ? update(kind, el.id, { [key]: v }) : null),
  };
}

const WALL: Field[] = [
  {
    key: "length",
    kind: "length",
    get: (el) => Math.round(len(vec(el.a), vec(el.b))),
    // The far end moves along the wall; walls joined there follow (docs/0044).
    set: (el, v, ctx) => (typeof v === "number" ? setWallLength(ctx.plan, el.id, v) : null),
  },
  size("wall", "thickness_mm", "thickness"),
  size("wall", "height_mm", "height"),
];

const SWINGS = ["left_in", "left_out", "right_in", "right_out", "sliding", "none"];

function fits(ctx: Context, el: Element, offset: number, width: number): boolean {
  const w = wallOf(ctx, el.wall_id);
  return Boolean(w && offset >= 0 && width > 0 && offset + width <= len(w.a, w.b));
}

const OPENING: Field[] = [
  {
    key: "openingType",
    kind: "choice",
    options: [{ value: "door" }, { value: "window" }],
    get: (el) => el.type as string,
    set: (el, v) =>
      v === "door" || v === "window"
        ? update("opening", el.id, { type: v, swing: v === "door" ? "left_in" : "none" })
        : null,
  },
  {
    key: "offset",
    kind: "length",
    get: (el) => el.offset_mm as number,
    set: (el, v, ctx) =>
      typeof v === "number" && fits(ctx, el, v, el.width_mm as number)
        ? update("opening", el.id, { offset_mm: v })
        : null,
  },
  {
    key: "width",
    kind: "length",
    get: (el) => el.width_mm as number,
    set: (el, v, ctx) =>
      typeof v === "number" && fits(ctx, el, el.offset_mm as number, v)
        ? update("opening", el.id, { width_mm: v })
        : null,
  },
  size("opening", "height_mm", "height"),
  {
    key: "sill",
    kind: "length",
    get: (el) => el.sill_mm as number,
    set: (el, v) =>
      typeof v === "number" && v >= 0 ? update("opening", el.id, { sill_mm: v }) : null,
  },
  {
    key: "swing",
    kind: "choice",
    options: SWINGS.map((value) => ({ value })),
    get: (el) => el.swing as string,
    set: (el, v) => (SWINGS.includes(String(v)) ? update("opening", el.id, { swing: v }) : null),
  },
];

/** The axis-aligned box around a footprint. */
function box(footprint: readonly Vec2[]) {
  const xs = footprint.map((p) => p[0]);
  const ys = footprint.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, d: maxY - minY };
}

/** Resizes a column to a w × d rectangle about its centre. */
function resizeColumn(el: Element, w: number, d: number): Op[] {
  const { cx, cy } = box(el.footprint as Vec2[]);
  const x0 = Math.round(cx - w / 2);
  const y0 = Math.round(cy - d / 2);
  const footprint = [
    [x0, y0],
    [x0 + w, y0],
    [x0 + w, y0 + d],
    [x0, y0 + d],
  ];
  return update("column", el.id, { footprint });
}

const COLUMN: Field[] = [
  {
    key: "width",
    kind: "length",
    get: (el) => box(el.footprint as Vec2[]).w,
    set: (el, v) => (positive(v) ? resizeColumn(el, v, box(el.footprint as Vec2[]).d) : null),
  },
  {
    key: "depth",
    kind: "length",
    get: (el) => box(el.footprint as Vec2[]).d,
    set: (el, v) => (positive(v) ? resizeColumn(el, box(el.footprint as Vec2[]).w, v) : null),
  },
  size("column", "height_mm", "height"),
];

function zoneFields(zoneTypes: ReadonlyMap<string, { name: string }>): Field[] {
  return [
    {
      key: "name",
      kind: "text",
      get: (el) => el.name as string,
      set: (el, v) => {
        const name = String(v).trim();
        return name && name.length <= 200 ? update("zone", el.id, { name }) : null;
      },
    },
    {
      key: "zoneType",
      kind: "choice",
      options: [...zoneTypes].map(([value, t]) => ({ value, label: t.name })),
      get: (el) => el.zone_type_id as string,
      set: (el, v) =>
        zoneTypes.has(String(v)) ? update("zone", el.id, { zone_type_id: v }) : null,
    },
    {
      key: "area",
      kind: "area",
      readOnly: true,
      get: (el) => Math.round(Math.abs(polygonArea(el.boundary as Vec2[]))),
    },
  ];
}

const MODES = ["assigned", "bookable", "unavailable"];

function objectFields(seats: boolean): Field[] {
  const position = (axis: 0 | 1): Field => ({
    key: axis ? "y" : "x",
    kind: "length",
    get: (el) => vec(el.position)[axis],
    set: (el, v) => {
      if (typeof v !== "number") return null;
      const p = [...(el.position as number[])];
      p[axis] = v;
      return update("object", el.id, { position: p });
    },
  });
  const fields: Field[] = [
    position(0),
    position(1),
    {
      key: "rotation",
      kind: "angle",
      get: (el) => el.rotation_ddeg as number,
      set: (el, v) =>
        typeof v === "number"
          ? update("object", el.id, { rotation_ddeg: ((Math.round(v) % 3600) + 3600) % 3600 })
          : null,
    },
  ];
  if (!seats) return fields;
  return [
    {
      key: "label",
      kind: "text",
      get: (el) => (el.label as string | null) ?? "",
      set: (el, v) => {
        const label = String(v).trim();
        return label.length <= 64 ? update("object", el.id, { label: label || null }) : null;
      },
    },
    {
      key: "mode",
      kind: "choice",
      options: MODES.map((value) => ({ value })),
      get: (el) => el.allocation_mode as string,
      set: (el, v) =>
        MODES.includes(String(v)) ? update("object", el.id, { allocation_mode: v }) : null,
    },
    ...fields,
  ];
}

/**
 * The selection as the panel sees it: one kind of element with its fields, or null when
 * nothing is selected or the selection mixes kinds. Objects attached to a selected host
 * (monitors on a desk) don't count.
 */
export function describeSelection(
  document: ApiPlan,
  selection: ReadonlySet<string>,
  zoneTypes: ReadonlyMap<string, { name: string }>,
): SelectionInfo | null {
  const found: { kind: Kind; el: Element }[] = [];
  for (const kind of Object.keys(LISTS) as Kind[]) {
    for (const el of document[LISTS[kind]] as unknown as Element[]) {
      if (!selection.has(el.id)) continue;
      if (kind === "object" && el.attached_to && selection.has(el.attached_to as string)) continue;
      found.push({ kind, el });
    }
  }
  const kind = found[0]?.kind;
  if (!kind || found.some((f) => f.kind !== kind)) return null;
  const elements = found.map((f) => f.el);
  let fields: Field[];
  if (kind === "wall") fields = WALL;
  else if (kind === "opening") {
    // Windows don't swing.
    fields = elements.every((e) => e.type === "door")
      ? OPENING
      : OPENING.filter((f) => f.key !== "swing");
  } else if (kind === "column") fields = COLUMN;
  else if (kind === "zone") fields = zoneFields(zoneTypes);
  else {
    const seats = elements.every((e) => document.catalog[e.catalog_item_rev_id as string]?.is_seat);
    fields = objectFields(seats);
  }
  return { kind, elements, fields };
}

/** The shared value of a field across the elements, or "mixed". */
export function sharedValue(field: Field, elements: readonly Element[]) {
  const values = elements.map((el) => field.get(el));
  return values.every((v) => v === values[0]) ? (values[0] ?? null) : ("mixed" as const);
}

/** Sets a field on every element; null if the value isn't allowed for any of them. */
export function setField(
  field: Field,
  elements: readonly Element[],
  value: number | string,
  ctx: Context,
): Op[] | null {
  if (!field.set) return null;
  const ops: Op[] = [];
  for (const el of elements) {
    if (field.get(el) === value) continue;
    const more = field.set(el, value, ctx);
    if (!more) return null;
    ops.push(...more);
  }
  return ops;
}
