import { describe, expect, it } from "vitest";

import { inBox } from "./hitTest";
import type { ApiPlan } from "./operations";
import { editing } from "./testPlan";
import {
  stubDesk,
  stubDoor,
  stubMonitor,
  stubPlan,
  stubScreen,
  stubWall,
  stubZone,
} from "@/test/stubs";

// An L of walls w1 (0,0)→(4000,0) and w2 (4000,0)→(4000,3000), 150 mm thick, around room z1.
// Door o1 spans 500–1400 along w1. Desk d1 (1600 × 800) is centred on (2000, 1500) with
// monitor m1 on it. Column c1 stands in a corner, and screen s1 hangs 1.4 m up at (3000, 2500).
const ROOM = stubPlan({
  walls: [stubWall("w1", [0, 0], [4000, 0]), stubWall("w2", [4000, 0], [4000, 3000])],
  openings: [stubDoor("o1", "w1", 500)],
  columns: [
    {
      id: "c1",
      footprint: [
        [200, 2500],
        [500, 2500],
        [500, 2800],
        [200, 2800],
      ],
    },
  ],
  zones: [
    stubZone("z1", [
      [0, 0],
      [4000, 0],
      [4000, 3000],
      [0, 3000],
    ]),
  ],
  objects: [
    stubDesk("d1", [2000, 1500]),
    stubMonitor("m1", "d1", [2000, 1700]),
    stubScreen("s1", [3000, 2500]),
  ],
}) as unknown as ApiPlan;

const EVERYTHING = ["w1", "w2", "o1", "c1", "z1", "d1", "m1", "s1"];

const selected = (store: ReturnType<typeof editing>["store"]) =>
  [...store.getState().selection].sort();

describe("selecting with a rectangle: Shift+drag (docs/0133)", () => {
  it("selects what's fully inside it, with what's attached", () => {
    const { store, drag } = editing(ROOM);
    drag([1000, 1000], [3000, 2000], { shift: true });
    expect(selected(store)).toEqual(["d1", "m1"]);
  });

  it("doesn't catch what's only partly inside, whichever way it's drawn", () => {
    const { store, drag } = editing(ROOM);
    // The desk sticks out to the left; its monitor is inside, and is caught on its own, as a
    // click on it would select it.
    drag([1500, 1000], [3000, 2000], { shift: true });
    expect(selected(store)).toEqual(["m1"]);
    drag([3000, 2000], [1000, 1000], { shift: true }); // right to left, the desk all inside
    expect(selected(store)).toEqual(["d1", "m1"]);
  });

  it("catches every kind of element", () => {
    const { store, drag } = editing(ROOM);
    drag([-200, -200], [4200, 3200], { shift: true });
    expect(selected(store)).toEqual([...EVERYTHING].sort());
  });

  it("adds to what's already selected", () => {
    const { store, click, drag } = editing(ROOM);
    click([4000, 1500]); // w2
    drag([1000, 1000], [3000, 2000], { shift: true });
    expect(selected(store)).toEqual(["d1", "m1", "w2"]);
  });

  it("starting on an item draws a rectangle; the item doesn't move", () => {
    const { store, drag } = editing(ROOM);
    drag([2000, 1500], [-100, -200], { shift: true }); // from the desk, around the door
    expect(selected(store)).toEqual(["o1"]);
    expect(store.getState().plan!.objects.d1!.position).toEqual([2000, 1500, 0]);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("Shift+click without moving still adds the one element", () => {
    const { store, click } = editing(ROOM);
    click([2000, 1300]); // d1
    click([4000, 1500], { shift: true }); // w2
    expect(selected(store)).toEqual(["d1", "m1", "w2"]);
  });

  it("shows the rectangle while dragging, and drops it on release", () => {
    const { store, interaction, at } = editing(ROOM);
    interaction.pointerDown({ ...at([1000, 1000]), shift: true });
    interaction.pointerMove({ ...at([3000, 2000]), shift: true });
    expect(store.getState().preview).toEqual({ kind: "box", from: [1000, 1000], to: [3000, 2000] });
    expect(store.getState().selection.size).toBe(0); // only on release
    interaction.pointerUp({ ...at([3000, 2000]), shift: true });
    expect(store.getState().preview).toBeNull();
  });

  it("only the start needs Shift", () => {
    const { store, interaction, at } = editing(ROOM);
    interaction.pointerDown({ ...at([1000, 1000]), shift: true });
    interaction.pointerMove(at([3000, 2000]));
    interaction.pointerUp(at([3000, 2000]));
    expect(selected(store)).toEqual(["d1", "m1"]);
  });

  it("Esc during the drag drops the rectangle and selects nothing", () => {
    const { store, interaction, at, click } = editing(ROOM);
    click([4000, 1500]); // w2
    interaction.pointerDown({ ...at([1000, 1000]), shift: true });
    interaction.pointerMove({ ...at([3000, 2000]), shift: true });
    expect(interaction.key("Escape")).toBe(true);
    expect(store.getState().preview).toBeNull();
    interaction.pointerUp({ ...at([3000, 2000]), shift: true });
    expect(selected(store)).toEqual(["w2"]);
  });

  it("a selected wall's end keeps its Shift+drag: it moves the corner (docs/0108)", () => {
    const { store, click, drag } = editing(ROOM);
    click([2000, 50]); // w1
    drag([0, 0], [-1000, -1000], { shift: true });
    const w1 = store.getState().plan!.walls.find((w) => w.id === "w1")!;
    expect(w1.a).not.toEqual([0, 0]);
    expect(selected(store)).toEqual(["w1"]);
  });

  it("with the height filter on, the faded items aren't caught (docs/0095)", () => {
    const { store, drag } = editing(ROOM);
    store.getState().setHeightFilter("raised");
    drag([-200, -200], [4200, 3200], { shift: true });
    expect(selected(store)).toEqual(["c1", "o1", "s1", "w1", "w2", "z1"]);
    store.getState().clearSelection();
    store.getState().setHeightFilter("floor");
    drag([-200, -200], [4200, 3200], { shift: true });
    expect(selected(store)).toEqual(["c1", "d1", "m1", "o1", "w1", "w2", "z1"]);
  });
});

describe("inBox", () => {
  const { store } = editing(ROOM);
  const plan = store.getState().plan!;

  it("counts a wall's thickness: its centreline alone isn't enough", () => {
    expect(inBox(plan, [-10, -10], [4010, 10])).not.toContain("w1");
    expect(inBox(plan, [-80, -80], [4080, 80])).toContain("w1");
  });

  it("counts a door's span of its wall, not the whole wall", () => {
    expect(inBox(plan, [490, -80], [1410, 80])).toEqual(["o1"]);
  });
});
