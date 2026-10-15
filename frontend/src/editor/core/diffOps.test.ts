import { describe, expect, it } from "vitest";

import { type ApiPlan, applyOps, diffOps } from "./operations";

const base = {
  floor_id: "f",
  version: 1,
  state: "published",
  revision: 1,
  walls: [],
  openings: [],
  columns: [],
  zones: [],
  objects: [],
  catalog: {},
};
const wall = (id: string, x: number) => ({
  id,
  a: [0, 0],
  b: [x, 0],
  thickness_mm: 150,
  height_mm: 3000,
});
const door = (id: string, wall_id: string) => ({
  id,
  wall_id,
  type: "door",
  offset_mm: 0,
  width_mm: 900,
  height_mm: 2100,
  sill_mm: 0,
  swing: "left_in",
});
const zone = (id: string, parent: string | null) => ({
  id,
  name: id,
  zone_type_id: "t",
  parent_zone_id: parent,
  boundary: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
});

describe("diffOps (putting back a discarded draft, docs/0089)", () => {
  it("adds, changes and deletes in an order the server accepts", () => {
    const from = {
      ...base,
      walls: [wall("w1", 4000), wall("w2", 3000)],
      openings: [door("o1", "w2")],
    } as unknown as ApiPlan;
    const to = {
      ...base,
      walls: [wall("w1", 5000), wall("w3", 2000)],
      openings: [door("o2", "w3")],
      zones: [zone("child", "parent"), zone("parent", null)],
    } as unknown as ApiPlan;
    const ops = diffOps(from, to);
    expect(ops.map((o) => `${o.op} ${o.id}`)).toEqual([
      "add w3",
      "add parent",
      "add child",
      "add o2",
      "update w1",
      "delete o1",
      "delete w2",
    ]);
    expect(ops[4]).toEqual({ op: "update", kind: "wall", id: "w1", data: { b: [5000, 0] } });
    // Applying them really turns one plan into the other.
    const result = applyOps(from, ops).plan;
    expect(result.walls).toEqual(to.walls);
    expect(result.openings).toEqual(to.openings);
    expect(result.zones.map((z) => z.id).sort()).toEqual(["child", "parent"]);
  });

  it("nothing to do for equal plans", () => {
    const plan = { ...base, walls: [wall("w1", 4000)] } as unknown as ApiPlan;
    expect(diffOps(plan, plan)).toEqual([]);
  });
});
