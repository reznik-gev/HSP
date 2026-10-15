import { describe, expect, it } from "vitest";

import { deleteSelection } from "./edits";
import { isSimplePolygon } from "./geometry";
import type { ApiPlan } from "./operations";
import { editing, PLAN } from "./testPlan";

const square = (x: number, y: number, size: number) => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];
const zone = (id: string, boundary: number[][], parent: string | null = null) => ({
  id,
  name: id,
  zone_type_id: "zt-room",
  parent_zone_id: parent,
  boundary,
});
const WITH_ZONES = {
  ...PLAN,
  // An open-plan area with a meeting room inside it, away from the test walls.
  zones: [
    zone("big", square(-6000, -6000, 4000)),
    zone("small", square(-5000, -5000, 1000), "big"),
  ],
} as unknown as ApiPlan;

describe("zone outlines (docs/0029, docs/0081 polygon_invalid)", () => {
  it("must have 3+ distinct corners, an area and no crossing edges", () => {
    expect(isSimplePolygon(square(0, 0, 10) as never)).toBe(true);
    expect(
      isSimplePolygon([
        [0, 0],
        [10, 0],
      ] as never),
    ).toBe(false);
    expect(
      isSimplePolygon([
        [0, 0],
        [10, 0],
        [20, 0],
      ] as never),
    ).toBe(false); // no area
    expect(
      isSimplePolygon([
        [0, 0],
        [10, 10],
        [10, 0],
        [0, 10],
      ] as never),
    ).toBe(false); // a bow tie
  });
});

describe("the zone tool (docs/0020)", () => {
  it("clicks the corners and closes on the first one; the zone gets the chosen type", () => {
    const { store, click } = editing();
    store.getState().setTool("zone");
    for (const p of [
      [-3000, -3000],
      [-1000, -3000],
      [-1000, -1000],
      [-3000, -1000],
      [-3000, -3000],
    ]) {
      click(p as [number, number]);
    }
    const added = store.getState().document!.zones.at(-1)!;
    expect(added).toMatchObject({
      name: "Room 1",
      zone_type_id: "zt-room",
      parent_zone_id: null,
      boundary: square(-3000, -3000, 2000),
    });
    expect(store.getState().undoStack).toHaveLength(1);
  });

  it("Enter closes; a crossing outline isn't closed; Escape drops it", () => {
    const { store, interaction, click } = editing();
    store.getState().setTool("zone");
    store.getState().setZoneType("zt-meet");
    for (const p of [
      [-3000, -3000],
      [-1000, -1000],
      [-1000, -3000],
      [-3000, -1000],
    ]) {
      click(p as [number, number]);
    }
    expect(interaction.key("Enter")).toBe(false); // a bow tie
    expect(interaction.key("Escape")).toBe(true);
    for (const p of [
      [-3000, -3000],
      [-1000, -3000],
      [-2000, -1000],
    ])
      click(p as [number, number]);
    interaction.key("Enter");
    expect(store.getState().plan!.zones.at(-1)).toMatchObject({ name: "Meeting room 1" });
  });
});

describe("selecting and changing zones", () => {
  it("a click picks the innermost zone; dragging a corner reshapes it", () => {
    const { store, click, drag } = editing(WITH_ZONES);
    click([-4500, -4500]);
    expect([...store.getState().selection]).toEqual(["small"]);
    drag([-4000, -4000], [-3500, -3500]);
    expect(store.getState().plan!.zones[1]!.boundary[2]).toEqual([-3500, -3500]);
    click([-2500, -5500]);
    expect([...store.getState().selection]).toEqual(["big"]);
  });

  it("a corner move that would make the outline cross itself is ignored", () => {
    const { store, click, drag } = editing(WITH_ZONES);
    click([-4500, -4500]);
    drag([-4000, -4000], [-5500, -4500]);
    expect(store.getState().plan!.zones[1]!.boundary[2]).toEqual([-4000, -4000]);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("deleting a zone takes the zones inside it, inner ones first", () => {
    const plan = editing(WITH_ZONES).store.getState().plan!;
    expect(deleteSelection(plan, new Set(["big"]))).toEqual([
      { op: "delete", kind: "zone", id: "small" },
      { op: "delete", kind: "zone", id: "big" },
    ]);
  });
});
