import { describe, expect, it } from "vitest";

import { stubDoor, stubPlan, stubWall, stubZone } from "@/test/stubs";

import { copyFragment, fragmentCentre, parseFragment, pasteOps } from "./clipboard";
import { type ApiPlan, applyOps } from "./operations";
import { editing } from "./testPlan";

// The test plan: walls w1 and w2, door o1 on w1, desk d1 (label A-01) with monitor m1 on it.
const doc = () => editing().store.getState().document!;
const square: [number, number][] = [
  [0, 0],
  [1000, 0],
  [1000, 1000],
  [0, 1000],
];

/** A zone inside another, with a wall and a door. */
const NESTED_ZONES = stubPlan({
  walls: [stubWall("w", [0, 0], [3000, 0])],
  openings: [stubDoor("o", "w", 0)],
  zones: [stubZone("outer", square), stubZone("inner", square, { parent_zone_id: "outer" })],
}) as unknown as ApiPlan;
/** Another floor, with nothing on it and nothing in its catalog yet. */
const EMPTY_FLOOR = stubPlan({ catalog: {} }) as unknown as ApiPlan;

describe("copying (docs/0049)", () => {
  it("takes what's attached to selected items, and doors only with their wall", () => {
    const f = copyFragment(doc(), new Set(["d1", "w2"]))!;
    expect(f.objects.map((o) => o.id)).toEqual(["d1", "m1"]);
    expect(f.walls.map((w) => w.id)).toEqual(["w2"]);
    expect(f.openings).toEqual([]); // o1 is on w1, which wasn't copied
    expect(Object.keys(f.catalog).sort()).toEqual(["rev-desk", "rev-mon"]);
    expect(copyFragment(doc(), new Set(["w1"]))!.openings.map((o) => o.id)).toEqual(["o1"]);
    expect(copyFragment(doc(), new Set())).toBeNull();
  });

  it("survives the trip through the system clipboard", () => {
    const f = copyFragment(doc(), new Set(["d1"]))!;
    expect(parseFragment(JSON.stringify(f))).toEqual(f);
    expect(parseFragment("not json")).toBeNull();
    expect(parseFragment('{"walls": []}')).toBeNull();
  });
});

describe("pasting (docs/0049)", () => {
  it("new ids everywhere, pointing at each other; no seat labels or devices", () => {
    const d = doc();
    const f = copyFragment(d, new Set(["w1", "d1"]))!;
    const { ops, ids } = pasteOps(f, [0, 5000]);
    expect(ids).toHaveLength(4);
    const after = applyOps(d, ops).plan;
    const wall = after.walls.find((w) => w.id === ids[0])!;
    expect(wall.a).toEqual([0, 5000]);
    const door = after.openings.find((o) => ids.includes(o.id))!;
    expect(door.wall_id).toBe(wall.id);
    const [desk, monitor] = after.objects.filter((o) => ids.includes(o.id));
    expect(desk).toMatchObject({ position: [2000, 6500, 0], label: null, device_id: null });
    expect(monitor).toMatchObject({ attached_to: desk!.id });
  });

  it("an attached item copied without its host stands alone; a zone without its parent too", () => {
    const zoneOnly = copyFragment(NESTED_ZONES, new Set(["inner"]))!;
    const zoneOps = pasteOps(zoneOnly, [0, 0]).ops;
    expect(zoneOps[0]).toMatchObject({ kind: "zone", data: { parent_zone_id: null } });
    const monitorOnly = copyFragment(doc(), new Set(["m1"]))!;
    expect(pasteOps(monitorOnly, [0, 0]).ops[0]).toMatchObject({ data: { attached_to: null } });
  });

  it("the centre of what was copied, for pasting at the pointer", () => {
    const f = copyFragment(doc(), new Set(["w1"]))!;
    expect(fragmentCentre(f)).toEqual([2000, 0]);
  });
});

describe("Ctrl+C, Ctrl+V on another floor", () => {
  it("pastes into a different plan, bringing the catalog entries it needs", () => {
    const f = copyFragment(doc(), new Set(["d1"]))!;
    const other = editing(EMPTY_FLOOR).store;
    for (const item of Object.values(f.catalog)) other.getState().ensureCatalog(item);
    const { ops, ids } = pasteOps(f, [0, 0]);
    other.getState().perform(ops);
    other.getState().select(ids);
    expect(other.getState().plan!.objectOrder).toHaveLength(2);
    expect(other.getState().selection.size).toBe(2);
    expect(other.getState().undoStack).toHaveLength(1);
  });
});
