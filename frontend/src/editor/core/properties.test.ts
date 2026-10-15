import { describe, expect, it } from "vitest";

import type { ApiPlan } from "./operations";
import { describeSelection, type Field, setField, sharedValue } from "./properties";
import { editing, PLAN, ZONE_TYPES } from "./testPlan";
import { formatLengthValue, parseAngle } from "./units";

// The test plan: w1 (0,0)→(4000,0) with door o1 (offset 500, 900 wide) meets w2
// (4000,0)→(4000,3000); desk d1 (a seat) with monitor m1 attached.
const PLAN_PLUS = {
  ...PLAN,
  columns: [
    {
      id: "c1",
      footprint: [
        [-200, -200],
        [200, -200],
        [200, 200],
        [-200, 200],
      ],
      height_mm: 3000,
    },
  ],
  zones: [
    {
      id: "z1",
      name: "Room 1",
      zone_type_id: "zt-room",
      parent_zone_id: null,
      boundary: [
        [0, 0],
        [4000, 0],
        [4000, 3000],
        [0, 3000],
      ],
    },
  ],
} as unknown as ApiPlan;

function setup(ids: string[]) {
  const { store } = editing(PLAN_PLUS);
  const s = store.getState();
  const info = describeSelection(s.document!, new Set(ids), ZONE_TYPES)!;
  const field = (key: string) => info.fields.find((f) => f.key === key) as Field;
  const set = (key: string, value: number | string) =>
    setField(field(key), info.elements, value, { plan: s.plan!, document: s.document! });
  return { store, info, field, set };
}

describe("the Properties panel's fields (docs/0045)", () => {
  it("one kind at a time; a desk's monitor doesn't count; mixed kinds show no fields", () => {
    expect(setup(["d1", "m1"]).info).toMatchObject({ kind: "object", elements: [{ id: "d1" }] });
    expect(setup(["d1", "m1"]).info.fields.map((f) => f.key)).toEqual([
      "label",
      "mode",
      "x",
      "y",
      "rotation",
    ]);
    const { store } = editing(PLAN_PLUS);
    expect(
      describeSelection(store.getState().document!, new Set(["w1", "d1"]), ZONE_TYPES),
    ).toBeNull();
  });

  it("a wall's length moves its far end, and the wall joined there follows", () => {
    const { set } = setup(["w1"]);
    expect(set("length", 5000)).toEqual([
      { op: "update", kind: "wall", id: "w1", data: { b: [5000, 0] } },
      { op: "update", kind: "wall", id: "w2", data: { a: [5000, 0] } },
    ]);
    // Too short for its door (offset 500 + 900).
    expect(set("length", 1000)).toBeNull();
  });

  it("a door must stay inside its wall; windows have no swing", () => {
    const { set, info } = setup(["o1"]);
    expect(info.fields.map((f) => f.key)).toContain("swing");
    expect(set("offset", 3100)).toEqual([
      { op: "update", kind: "opening", id: "o1", data: { offset_mm: 3100 } },
    ]);
    expect(set("offset", 3200)).toBeNull();
    expect(set("openingType", "window")).toEqual([
      { op: "update", kind: "opening", id: "o1", data: { type: "window", swing: "none" } },
    ]);
  });

  it("a column resizes about its centre", () => {
    const { set, field, info } = setup(["c1"]);
    expect(sharedValue(field("width"), info.elements)).toBe(400);
    expect(set("width", 600)).toEqual([
      {
        op: "update",
        kind: "column",
        id: "c1",
        data: {
          footprint: [
            [-300, -200],
            [300, -200],
            [300, 200],
            [-300, 200],
          ],
        },
      },
    ]);
  });

  it("zones: name, type, and the area in mm²", () => {
    const { set, field, info } = setup(["z1"]);
    expect(sharedValue(field("area"), info.elements)).toBe(12_000_000);
    expect(field("area").readOnly).toBe(true);
    expect(set("name", "  Kitchen ")).toEqual([
      { op: "update", kind: "zone", id: "z1", data: { name: "Kitchen" } },
    ]);
    expect(set("name", "   ")).toBeNull();
    expect(set("zoneType", "zt-meet")).toHaveLength(1);
    expect(set("zoneType", "nope")).toBeNull();
  });

  it("seats: label (empty clears it) and use; rotation wraps around", () => {
    const { set } = setup(["d1"]);
    expect(set("label", "A-07")).toEqual([
      { op: "update", kind: "object", id: "d1", data: { label: "A-07" } },
    ]);
    expect(set("label", "")).toEqual([
      { op: "update", kind: "object", id: "d1", data: { label: null } },
    ]);
    expect(set("mode", "bookable")).toHaveLength(1);
    expect(set("rotation", 3700)).toEqual([
      { op: "update", kind: "object", id: "d1", data: { rotation_ddeg: 100 } },
    ]);
  });

  it("several walls: differing values are mixed; setting one changes all that differ", () => {
    const { field, info, set } = setup(["w1", "w2"]);
    expect(sharedValue(field("length"), info.elements)).toBe("mixed");
    expect(sharedValue(field("thickness"), info.elements)).toBe(150);
    expect(set("height", 2700)).toHaveLength(2);
    expect(set("thickness", 150)).toEqual([]); // nothing to change
  });
});

describe("units for the fields (docs/0046)", () => {
  it("formats bare numbers in the display unit and parses angles", () => {
    expect(formatLengthValue(1250, "cm")).toBe("125");
    expect(formatLengthValue(1255, "cm")).toBe("125.5");
    expect(formatLengthValue(1250, "m")).toBe("1.25");
    expect(parseAngle("90")).toBe(900);
    expect(parseAngle("-90")).toBe(2700);
    expect(parseAngle("45,5°")).toBe(455);
    expect(parseAngle("north")).toBeNull();
  });
});
