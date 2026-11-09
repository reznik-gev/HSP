import { describe, expect, it } from "vitest";

import type { ApiPlan } from "./operations";
import type { Plan } from "./plan";
import { editing } from "./testPlan";
import { stubDesk, stubDoor, stubPlan, stubWall, stubZone } from "@/test/stubs";

// Walls w1 (0,0)→(4000,0) and w2 (4000,0)→(4000,3000) meet at (4000, 0). Door o1 spans
// 500–1400 along w1. Room z1 is the 4 × 3 m rectangle. Desks d1 at (2000, 1500) and d2 at
// (1000, 2500), 1600 × 800 each.
const ROOM = stubPlan({
  walls: [stubWall("w1", [0, 0], [4000, 0]), stubWall("w2", [4000, 0], [4000, 3000])],
  openings: [stubDoor("o1", "w1", 500)],
  zones: [
    stubZone("z1", [
      [0, 0],
      [4000, 0],
      [4000, 3000],
      [0, 3000],
    ]),
  ],
  objects: [stubDesk("d1", [2000, 1500]), stubDesk("d2", [1000, 2500])],
}) as unknown as ApiPlan;

const wall = (plan: Plan, id: string) => {
  const w = plan.walls.find((x) => x.id === id)!;
  return [w.a, w.b];
};

/** The room, with `ids` selected. */
function withSelected(...ids: string[]) {
  const ui = editing(ROOM);
  ui.store.getState().select(ids);
  return ui;
}

describe("dragging a group (docs/0133)", () => {
  it("dragging one item moves the walls selected with it; the walls joined to them stretch", () => {
    const { store, drag } = withSelected("d1", "w2");
    drag([2000, 1300], [3000, 1300]);
    const plan = store.getState().plan!;
    expect(plan.objects.d1!.position).toEqual([3000, 1500, 0]);
    expect(wall(plan, "w2")).toEqual([
      [5000, 0],
      [5000, 3000],
    ]);
    expect(wall(plan, "w1")).toEqual([
      [0, 0],
      [5000, 0],
    ]);
    store.getState().undo(); // one step
    expect(store.getState().plan!.objects.d1!.position).toEqual([2000, 1500, 0]);
    expect(wall(store.getState().plan!, "w2")[0]).toEqual([4000, 0]);
  });

  it("grabbing the wall moves the whole group too", () => {
    const { store, drag } = withSelected("d1", "w2");
    drag([4000, 1500], [4000, 2000]);
    const plan = store.getState().plan!;
    expect(plan.objects.d1!.position).toEqual([2000, 2000, 0]);
    expect(wall(plan, "w2")[0]).toEqual([4000, 500]);
    expect(store.getState().selection).toEqual(new Set(["d1", "w2"]));
  });

  it("a zone in the group moves, and so does the group when it's grabbed inside the zone", () => {
    const { store, drag } = withSelected("d1", "z1");
    drag([500, 500], [1500, 500]); // inside z1, away from the desk
    const plan = store.getState().plan!;
    expect(plan.zones[0]!.boundary[0]).toEqual([1000, 0]);
    expect(plan.objects.d1!.position).toEqual([3000, 1500, 0]);
  });

  it("a door whose wall isn't in the group slides along it", () => {
    const { store, drag } = withSelected("d1", "o1");
    drag([2000, 1300], [2300, 2300]);
    const plan = store.getState().plan!;
    expect(plan.openings[0]!.offset_mm).toBe(800);
    expect(plan.objects.d1!.position).toEqual([2300, 2500, 0]);
  });

  it("moves in grid steps", () => {
    const { store, drag } = withSelected("d1", "w2");
    drag([2000, 1300], [3013, 1322]);
    expect(store.getState().plan!.objects.d1!.position).toEqual([3000, 1500, 0]);
  });

  it("Alt detaches it from the walls joined to it, and turns the grid off", () => {
    const { store, drag } = withSelected("d1", "w2");
    drag([2000, 1300], [3013, 1300], { alt: true });
    const plan = store.getState().plan!;
    expect(wall(plan, "w2")[0]).toEqual([5013, 0]);
    expect(wall(plan, "w1")[1]).toEqual([4000, 0]);
  });

  it("Alt pressed mid-drag detaches it for the rest of the drag (docs/0130)", () => {
    const { store, interaction, at } = withSelected("d1", "w2");
    interaction.pointerDown(at([2000, 1300]));
    interaction.pointerMove({ ...at([2500, 1300]), alt: true });
    interaction.pointerMove(at([3000, 1300]));
    interaction.pointerUp(at([3000, 1300]));
    const plan = store.getState().plan!;
    expect(wall(plan, "w2")[0]).toEqual([5000, 0]);
    expect(wall(plan, "w1")[1]).toEqual([4000, 0]);
  });

  it("while dragging, the preview shows the walls where they'll be, and nothing is saved", () => {
    const { store, interaction, at } = withSelected("d1", "w2");
    interaction.pointerDown(at([2000, 1300]));
    interaction.pointerMove(at([3000, 1300]));
    const preview = store.getState().preview;
    expect(preview?.kind).toBe("group");
    if (preview?.kind !== "group") return;
    expect(preview.walls.map((w) => w.id).sort()).toEqual(["w1", "w2"]);
    expect(preview.openings.map((o) => o.id)).toEqual(["o1"]); // on stretching w1
    expect(store.getState().drag).toMatchObject({ dx: 1000, dy: 0 });
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("a typed distance moves it exactly that far along the drag (docs/0045)", () => {
    const { store, interaction, at } = withSelected("d1", "w2");
    interaction.pointerDown(at([2000, 1300]));
    interaction.pointerMove(at([2500, 1300]));
    expect(interaction.measureTarget()).toBe("move");
    expect(interaction.applyMeasure({ lengthMm: 1234, angleDdeg: null })).toBe(true);
    const plan = store.getState().plan!;
    expect(plan.objects.d1!.position).toEqual([3234, 1500, 0]);
    expect(wall(plan, "w2")[0]).toEqual([5234, 0]);
    expect(store.getState().preview).toBeNull();
  });

  it("a click on one of the group keeps the group selected", () => {
    const { store, click } = withSelected("d1", "w2");
    click([4000, 1500]);
    expect(store.getState().selection).toEqual(new Set(["d1", "w2"]));
  });

  it("grabbing something outside the group selects it alone and drags only it", () => {
    const { store, drag } = withSelected("d1", "w2");
    drag([1000, 2500], [1500, 2500]); // d2
    const plan = store.getState().plan!;
    expect(store.getState().selection).toEqual(new Set(["d2"]));
    expect(plan.objects.d2!.position[0]).toBeGreaterThan(1000);
    expect(plan.objects.d1!.position).toEqual([2000, 1500, 0]);
    expect(wall(plan, "w2")[0]).toEqual([4000, 0]);
  });
});
