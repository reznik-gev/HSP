/**
 * A small plan and an editing store driven through `Interaction`, for core tests. 1 px = 10 mm,
 * with plan (0, 0) at the centre of an 800 × 600 canvas.
 */
import { stubPlan, stubDesk, STUB_DESK_ITEM, stubDoor, stubMonitor, stubWall } from "@/test/stubs";

import { Interaction, type PointerInput } from "./interaction";
import type { ApiPlan } from "./operations";
import type { Vec2 } from "./plan";
import { createEditorStore } from "./store";
import { planToScreen } from "./viewport";

export { STUB_DESK_ITEM };

// An L: w1 and w2 meet at (4000, 0); a door on w1; desk d1 with monitor m1 on it.
export const PLAN = stubPlan({
  walls: [stubWall("w1", [0, 0], [4000, 0]), stubWall("w2", [4000, 0], [4000, 3000])],
  openings: [stubDoor("o1", "w1", 500)],
  objects: [stubDesk("d1", [2000, 1500], { label: "A-01" }), stubMonitor("m1", "d1", [2000, 1700])],
}) as unknown as ApiPlan;

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
