import { describe, expect, it } from "vitest";

import { setWallLength } from "./edits";
import type { ApiPlan } from "./operations";
import type { Plan } from "./plan";
import { editing } from "./testPlan";
import { stubPlan, stubWall } from "@/test/stubs";

// The test plan: w1 (0,0)→(4000,0) meets w2 (4000,0)→(4000,3000); door o1 on w1 at 500.
const wall = (id: string) => (plan: Plan) => plan.walls.find((w) => w.id === id)!;

/** The test plan, plus w3 on its own: (0,2000) → (1000,2000). */
const WITH_W3 = stubPlan({
  walls: [
    stubWall("w1", [0, 0], [4000, 0]),
    stubWall("w2", [4000, 0], [4000, 3000]),
    stubWall("w3", [0, 2000], [1000, 2000]),
  ],
}) as unknown as ApiPlan;

/** A wall on its own: neither end joined. */
const LONE = stubPlan({ walls: [stubWall("w9", [0, 0], [3000, 0])] }) as unknown as ApiPlan;

describe("moving whole walls (docs/0108)", () => {
  it("dragging a selected wall moves it, and the wall joined to it stretches", () => {
    const { store, click, drag } = editing();
    click([2000, 50]); // select w1
    drag([2000, 0], [2013, 1023]);
    const plan = store.getState().plan!;
    expect([wall("w1")(plan).a, wall("w1")(plan).b]).toEqual([
      [0, 1000],
      [4000, 1000],
    ]);
    expect([wall("w2")(plan).a, wall("w2")(plan).b]).toEqual([
      [4000, 1000],
      [4000, 3000],
    ]);
    expect(plan.openings[0]!.offset_mm).toBe(500); // the door moves with its wall
  });

  it("it's one step to undo", () => {
    const { store, click, drag } = editing();
    click([2000, 50]);
    drag([2000, 0], [2000, 1000]);
    store.getState().undo();
    const plan = store.getState().plan!;
    expect(wall("w1")(plan).a).toEqual([0, 0]);
    expect(wall("w2")(plan).a).toEqual([4000, 0]);
  });

  it("with Alt, it detaches from the walls joined to it", () => {
    const { store, click, drag } = editing();
    click([2000, 50]);
    drag([2000, 0], [2000, 1000], { alt: true });
    const plan = store.getState().plan!;
    expect(wall("w1")(plan).b).toEqual([4000, 1000]);
    expect(wall("w2")(plan).a).toEqual([4000, 0]);
  });

  it("while dragging, the preview names the walls that stretch: w2, at w1's end b", () => {
    const { store, interaction, click, at } = editing();
    click([2000, 50]);
    interaction.pointerDown(at([2000, 0]));
    interaction.pointerMove(at([2000, 1000]));
    expect(store.getState().preview).toMatchObject({
      kind: "wallMove",
      joinedA: [],
      joinedB: ["w2"],
    });
  });

  it("with Alt, the preview stretches no wall, as the release won't either", () => {
    const { store, interaction, click, at } = editing();
    click([2000, 50]);
    interaction.pointerDown({ ...at([2000, 0]), alt: true });
    interaction.pointerMove({ ...at([2000, 1000]), alt: true });
    expect(store.getState().preview).toMatchObject({
      kind: "wallMove",
      joinedA: [],
      joinedB: [],
    });
  });

  it("an end lands on another wall's end when it comes near", () => {
    const { store, click, drag } = editing(WITH_W3);
    click([2000, 50]); // select w1
    drag([2000, 0], [3030, 1980]); // its free end (0,0) to near w3's end (1000,2000)
    const plan = store.getState().plan!;
    expect([wall("w1")(plan).a, wall("w1")(plan).b]).toEqual([
      [1000, 2000],
      [5000, 2000],
    ]);
    expect(wall("w2")(plan).a).toEqual([5000, 2000]);
  });

  it("dragging a wall that isn't selected pans, as before", () => {
    const { store, drag } = editing();
    drag([2000, 0], [2000, 1000]);
    expect(wall("w1")(store.getState().plan!).a).toEqual([0, 0]);
  });

  it("a lone wall's length moves the end it was drawn to", () => {
    const { store } = editing(LONE);
    expect(setWallLength(store.getState().plan!, "w9", 2000)).toEqual([
      { op: "update", kind: "wall", id: "w9", data: { b: [2000, 0] } },
    ]);
  });
});
