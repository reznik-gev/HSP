import { describe, expect, it } from "vitest";

import { measuredPoint, parseMeasure } from "./measure";
import { editing } from "./testPlan";

describe("reading a typed measurement (docs/0045, docs/0046)", () => {
  it("a length in the display unit or its own, with an optional angle", () => {
    expect(parseMeasure("350", "", "cm")).toEqual({ lengthMm: 3500, angleDdeg: null });
    expect(parseMeasure("3.5m", "", "cm")).toEqual({ lengthMm: 3500, angleDdeg: null });
    expect(parseMeasure("350", "90", "cm")).toEqual({ lengthMm: 3500, angleDdeg: 900 });
    expect(parseMeasure("350<90", "", "cm")).toEqual({ lengthMm: 3500, angleDdeg: 900 });
    expect(parseMeasure("350<-90", "", "cm")).toEqual({ lengthMm: 3500, angleDdeg: 2700 });
  });

  it("refuses what isn't a positive length or a number of degrees", () => {
    expect(parseMeasure("", "", "cm")).toBeNull();
    expect(parseMeasure("0", "", "cm")).toBeNull();
    expect(parseMeasure("far", "", "cm")).toBeNull();
    expect(parseMeasure("350", "north", "cm")).toBeNull();
  });

  it("measures towards the pointer unless an angle is given", () => {
    const m = { lengthMm: 2000, angleDdeg: null };
    expect(measuredPoint([0, 0], [10, 10], m)).toEqual([1414, 1414]);
    expect(measuredPoint([0, 0], [0, 0], m)).toEqual([2000, 0]); // no direction yet: east
    expect(measuredPoint([0, 0], [10, 10], { lengthMm: 2000, angleDdeg: 900 })).toEqual([0, 2000]);
  });
});

describe("typing measurements while working", () => {
  it("drawing a wall: a typed length places the next corner, towards the pointer or at an angle", () => {
    const { store, interaction, click, at } = editing();
    store.getState().setTool("wall");
    expect(interaction.measureTarget()).toBeNull(); // nothing to measure from yet
    click([-3000, -2000]);
    interaction.pointerMove(at([-1000, -2000])); // pointing east
    expect(interaction.measureTarget()).toBe("wall");
    expect(interaction.applyMeasure({ lengthMm: 3500, angleDdeg: null })).toBe(true);
    expect(interaction.applyMeasure({ lengthMm: 1200, angleDdeg: 900 })).toBe(true);
    expect(
      store
        .getState()
        .plan!.walls.slice(2)
        .map((w) => [w.a, w.b]),
    ).toEqual([
      [
        [-3000, -2000],
        [500, -2000],
      ],
      [
        [500, -2000],
        [500, -800],
      ],
    ]);
  });

  it("dragging: a typed distance moves exactly that far along the drag, as one step", () => {
    const { store, interaction, at } = editing();
    interaction.pointerDown({ ...at([2000, 1500]), button: 0, shift: false });
    interaction.pointerMove({ ...at([-1000, 1500]), button: 0, shift: false });
    expect(interaction.measureTarget()).toBe("move");
    expect(interaction.applyMeasure({ lengthMm: 1234, angleDdeg: null })).toBe(true);
    interaction.pointerUp({ ...at([-1000, 1500]), button: 0, shift: false });
    expect(store.getState().plan!.objects.d1!.position).toEqual([766, 1500, 0]);
    expect(store.getState().undoStack).toHaveLength(1);
  });
});
