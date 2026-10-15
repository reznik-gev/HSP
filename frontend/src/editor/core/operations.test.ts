import { describe, expect, it } from "vitest";

import { type ApiPlan, applyOps, newId, type Op } from "./operations";

const WALL = { id: "w1", a: [0, 0], b: [4000, 0], thickness_mm: 200, height_mm: 3000 };
const DESK = {
  id: "d1",
  catalog_item_rev_id: "rev",
  position: [1000, 1000, 0],
  rotation_ddeg: 0,
  label: "A-01",
  attached_to: null,
  allocation_mode: "assigned",
};
const PLAN = {
  floor_id: "f",
  version: 1,
  state: "draft",
  revision: 1,
  walls: [WALL],
  openings: [],
  columns: [],
  zones: [],
  objects: [DESK],
  catalog: {},
} as unknown as ApiPlan;

describe("plan operations (docs/0036, docs/0050)", () => {
  it("add, update and delete, without touching the original plan", () => {
    const ops: Op[] = [
      { op: "add", kind: "wall", id: "w2", data: { a: [0, 0], b: [0, 3000] } },
      { op: "update", kind: "object", id: "d1", data: { position: [1500, 1000, 0] } },
      { op: "delete", kind: "wall", id: "w1" },
    ];
    const { plan } = applyOps(PLAN, ops);
    expect(plan.walls.map((w) => w.id)).toEqual(["w2"]);
    expect(plan.objects[0]).toEqual({ ...DESK, position: [1500, 1000, 0] });
    expect(PLAN.walls).toEqual([WALL]);
    expect(plan.openings).toBe(PLAN.openings); // untouched lists are shared
  });

  it("the inverse puts everything back", () => {
    const ops: Op[] = [
      { op: "update", kind: "object", id: "d1", data: { position: [1500, 1000, 0], label: "B" } },
      { op: "update", kind: "object", id: "d1", data: { label: "C" } },
      { op: "delete", kind: "wall", id: "w1" },
      { op: "add", kind: "wall", id: "w2", data: { a: [0, 0], b: [0, 3000] } },
    ];
    const done = applyOps(PLAN, ops);
    expect(done.inverse[0]).toEqual({ op: "delete", kind: "wall", id: "w2" });
    const undone = applyOps(done.plan, done.inverse);
    expect(undone.plan.walls).toEqual([WALL]);
    expect(undone.plan.objects).toEqual([DESK]);
    // ...and the inverse of the inverse redoes it.
    expect(applyOps(undone.plan, undone.inverse).plan).toEqual(done.plan);
  });

  it("refuses operations that don't fit the plan", () => {
    expect(() => applyOps(PLAN, [{ op: "delete", kind: "wall", id: "nope" }])).toThrow();
    expect(() => applyOps(PLAN, [{ op: "add", kind: "wall", id: "w1", data: {} }])).toThrow();
  });

  it("new ids are UUIDv7 and sort by time", () => {
    const a = newId(1_700_000_000_000);
    const b = newId(1_700_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
});
