import { describe, expect, it } from "vitest";

import { stubPlan, stubDoor, stubWall, stubZone } from "@/test/stubs";

import { type ApiPlan, applyOps, diffOps } from "./operations";

const base = stubPlan({ state: "published" });
const tri = [
  [0, 0],
  [1, 0],
  [0, 1],
] as [number, number][];
const room = (id: string, parent: string | null) => stubZone(id, tri, { parent_zone_id: parent });

describe("diffOps (putting back a discarded draft, docs/0089)", () => {
  it("adds, changes and deletes in an order the server accepts", () => {
    const from = {
      ...base,
      walls: [stubWall("w1", [0, 0], [4000, 0]), stubWall("w2", [0, 0], [3000, 0])],
      openings: [stubDoor("o1", "w2", 0)],
    } as unknown as ApiPlan;
    const to = {
      ...base,
      walls: [stubWall("w1", [0, 0], [5000, 0]), stubWall("w3", [0, 0], [2000, 0])],
      openings: [stubDoor("o2", "w3", 0)],
      zones: [room("child", "parent"), room("parent", null)],
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
    const plan = { ...base, walls: [stubWall("w1", [0, 0], [4000, 0])] } as unknown as ApiPlan;
    expect(diffOps(plan, plan)).toEqual([]);
  });
});
