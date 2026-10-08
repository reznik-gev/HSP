/**
 * Client-side floor-plan model (docs/0036 payload shape, docs/0029 units).
 * All lengths are integer millimetres; rotation is integer decidegrees; +Y is plan north.
 */

export type Vec2 = readonly [x: number, y: number];
export type Vec3 = readonly [x: number, y: number, z: number];

export interface Wall {
  id: string;
  a: Vec2;
  b: Vec2;
  thickness_mm: number;
  height_mm: number;
}

export type DoorSwing = "left_in" | "left_out" | "right_in" | "right_out" | "sliding" | "none";

export interface Opening {
  id: string;
  wall_id: string;
  type: "door" | "window";
  offset_mm: number;
  width_mm: number;
  height_mm: number;
  sill_mm: number;
  swing: DoorSwing;
}

export interface Zone {
  id: string;
  name: string;
  zone_type: string;
  color: string;
  boundary: readonly Vec2[];
}

export interface CatalogItem {
  id: string;
  key: string;
  category: string;
  shape: "box" | "cylinder" | "l_shape" | "model";
  width_mm: number;
  depth_mm: number;
  height_mm: number;
  color: string;
  is_seat: boolean;
}

export interface PlacedObject {
  id: string;
  catalog_item_rev_id: string;
  position: Vec3;
  rotation_ddeg: number;
  label: string | null;
  attached_to: string | null;
}

export interface Plan {
  walls: readonly Wall[];
  openings: readonly Opening[];
  zones: readonly Zone[];
  /** Objects by id, plus a stable draw order (lower index is drawn first). */
  objects: Readonly<Record<string, PlacedObject>>;
  objectOrder: readonly string[];
  catalog: Readonly<Record<string, CatalogItem>>;
}

export function catalogItemOf(plan: Plan, obj: PlacedObject): CatalogItem {
  const item = plan.catalog[obj.catalog_item_rev_id];
  if (!item) throw new Error(`unknown catalog item ${obj.catalog_item_rev_id}`);
  return item;
}
