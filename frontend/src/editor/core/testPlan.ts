/**
 * A small plan and an editing store driven through `Interaction`, for core tests. 1 px = 10 mm,
 * with plan (0, 0) at the centre of an 800 × 600 canvas.
 */
import { Interaction, type PointerInput } from "./interaction";
import type { ApiPlan } from "./operations";
import type { Vec2 } from "./plan";
import { createEditorStore } from "./store";
import { planToScreen } from "./viewport";

const wall = (id: string, a: Vec2, b: Vec2) => ({ id, a, b, thickness_mm: 150, height_mm: 3000 });
export const DESK_ITEM = {
  id: "rev",
  key: "desk",
  category: "desk",
  shape: "box",
  width_mm: 1600,
  depth_mm: 800,
  height_mm: 740,
  color: null,
  is_seat: true,
};
const MONITOR_ITEM = {
  ...DESK_ITEM,
  id: "mon",
  key: "monitor",
  category: "monitor",
  width_mm: 600,
  depth_mm: 200,
  is_seat: false,
};
export const PLAN = {
  floor_id: "f",
  version: 1,
  state: "draft",
  revision: 1,
  // An L: w1 and w2 meet at (4000, 0).
  walls: [wall("w1", [0, 0], [4000, 0]), wall("w2", [4000, 0], [4000, 3000])],
  openings: [
    {
      id: "o1",
      wall_id: "w1",
      type: "door",
      offset_mm: 500,
      width_mm: 900,
      height_mm: 2100,
      sill_mm: 0,
      swing: "left_in",
    },
  ],
  columns: [],
  zones: [],
  objects: [
    {
      id: "d1",
      catalog_item_rev_id: "rev",
      position: [2000, 1500, 0],
      rotation_ddeg: 0,
      label: "A-01",
      attached_to: null,
    },
    {
      id: "m1",
      catalog_item_rev_id: "mon",
      position: [2000, 1700, 740],
      rotation_ddeg: 0,
      label: null,
      attached_to: "d1",
    },
  ],
  catalog: { rev: DESK_ITEM, mon: MONITOR_ITEM },
} as unknown as ApiPlan;

export const ZONE_TYPES = new Map([
  ["zt-room", { name: "Room", color: "#93c5fd" }],
  ["zt-meet", { name: "Meeting room", color: "#c4b5fd" }],
]);

export function editing(plan: ApiPlan = PLAN) {
  const store = createEditorStore();
  store.getState().loadDocument(plan, ZONE_TYPES);
  store.getState().setZoneType("zt-room");
  // 1 px = 10 mm, plan origin at the centre of an 800 × 600 canvas.
  store.getState().setViewport({ cx: 0, cy: 0, mmPerPx: 10 });
  const interaction = new Interaction(store);
  interaction.setSize(800, 600);
  const at = (p: Vec2) => {
    const [sx, sy] = planToScreen(store.getState().viewport, [800, 600], p);
    return { sx, sy, button: 0, shift: false };
  };
  const click = (p: Vec2, extra: Partial<PointerInput> = {}) => {
    interaction.pointerDown({ ...at(p), ...extra });
    interaction.pointerUp({ ...at(p), ...extra });
  };
  const drag = (from: Vec2, to: Vec2, extra: Partial<PointerInput> = {}) => {
    interaction.pointerDown({ ...at(from), ...extra });
    interaction.pointerMove({ ...at(to), ...extra });
    interaction.pointerUp({ ...at(to), ...extra });
  };
  return { store, interaction, click, drag, at };
}
