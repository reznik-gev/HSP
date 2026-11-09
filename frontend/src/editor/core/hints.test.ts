import { describe, expect, it } from "vitest";

import { editorHint } from "./hints";
import type { ApiPlan } from "./operations";
import { editing, LONE_WALL_PLAN } from "./testPlan";
import { stubPlan, stubZone } from "@/test/stubs";

// The test plan: w1 (0,0)→(4000,0) meets w2 (4000,0)→(4000,3000); desk d1 at (2000,1500).

/** A room zone z1, 2 × 2 m, with nothing else in it. */
const ROOM = stubPlan({
  zones: [
    stubZone("z1", [
      [0, 0],
      [2000, 0],
      [2000, 2000],
      [0, 2000],
    ]),
  ],
}) as unknown as ApiPlan;

/** A 40 cm column c1 centred on (-2000, -2000), with nothing else. */
const ONE_COLUMN = stubPlan({
  columns: [
    {
      id: "c1",
      footprint: [
        [-2200, -2200],
        [-1800, -2200],
        [-1800, -1800],
        [-2200, -1800],
      ],
      height_mm: 3000,
    },
  ],
}) as unknown as ApiPlan;

describe("the hint line (docs/0130)", () => {
  it("with nothing selected, it says how to select and pan", () => {
    const { store } = editing();
    expect(editorHint(store.getState())).toEqual({ key: "select" });
  });

  it("a selected wall and a selected item each get their own hint", () => {
    const { store, click } = editing();
    click([2000, 50]);
    expect(editorHint(store.getState())).toEqual({ key: "selectedWall" });
    click([2000, 1500]);
    expect(editorHint(store.getState())).toEqual({ key: "selected" });
  });

  it("a selected zone gets its own hint", () => {
    const { store, click } = editing(ROOM);
    click([1000, 1000]);
    expect(editorHint(store.getState())).toEqual({ key: "selectedZone" });
  });

  it("dragging a corner counts the walls there, until Alt detaches the grabbed one", () => {
    const { store, interaction, click, at } = editing();
    click([2000, 50]);
    interaction.pointerDown(at([4000, 0]));
    interaction.pointerMove(at([4200, 0]));
    expect(editorHint(store.getState())).toEqual({ key: "junction", walls: 2 });
    interaction.pointerMove({ ...at([4300, 0]), alt: true });
    expect(editorHint(store.getState())).toEqual({ key: "junctionDetached" });
  });

  it("dragging a joined wall says the others stretch, until Alt detaches it", () => {
    const { store, interaction, click, at } = editing();
    click([2000, 50]);
    interaction.pointerDown(at([2000, 0]));
    interaction.pointerMove(at([2000, 500]));
    expect(editorHint(store.getState())).toEqual({ key: "wallMove" });
    interaction.pointerMove({ ...at([2000, 800]), alt: true });
    expect(editorHint(store.getState())).toEqual({ key: "wallMoveDetached" });
  });

  it("dragging a wall joined to nothing doesn't offer to detach it", () => {
    const { store, interaction, click, at } = editing(LONE_WALL_PLAN);
    click([1500, 50]);
    interaction.pointerDown(at([1500, 0]));
    interaction.pointerMove(at([1500, 500]));
    expect(editorHint(store.getState())).toEqual({ key: "wallMoveAlone" });
  });

  it("dragging an end that no other wall meets doesn't offer to detach it", () => {
    const { store, interaction, click, at } = editing(LONE_WALL_PLAN);
    click([1500, 50]);
    interaction.pointerDown(at([0, 0]));
    interaction.pointerMove(at([0, 500]));
    expect(editorHint(store.getState())).toEqual({ key: "junctionAlone" });
  });

  it("dragging furniture offers a typed distance and R; a column only the distance", () => {
    const { store, interaction, at } = editing();
    interaction.pointerDown(at([2000, 1500]));
    interaction.pointerMove(at([2500, 1500]));
    expect(editorHint(store.getState())).toEqual({ key: "draggingFurniture" });
    interaction.pointerUp(at([2500, 1500]));

    const column = editing(ONE_COLUMN);
    column.interaction.pointerDown(column.at([-2000, -2000]));
    column.interaction.pointerMove(column.at([-1500, -2000]));
    expect(editorHint(column.store.getState())).toEqual({ key: "dragging" });
  });

  it("the wall tool says how to start, then how to end the wall", () => {
    const { store, click } = editing();
    store.getState().setTool("wall");
    expect(editorHint(store.getState())).toEqual({ key: "wall" });
    click([0, 3000]);
    expect(editorHint(store.getState())).toEqual({ key: "wallDrawing" });
  });
});
