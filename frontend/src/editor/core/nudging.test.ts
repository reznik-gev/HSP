import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NUDGE_RUN_MS } from "./store";
import { editing } from "./testPlan";

// The test plan: w1 (0,0)→(4000,0) meets w2 (4000,0)→(4000,3000); door o1 on w1 at 500;
// desk d1 at (2000,1500) with monitor m1 on it.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("nudging with the arrow keys (docs/0108)", () => {
  it("moves the selection 1 cm, or 10 cm with Shift; up is up on the plan", () => {
    const { store, interaction } = editing();
    store.getState().select(["d1", "m1"]);
    expect(interaction.key("ArrowRight")).toBe(true);
    expect(interaction.key("ArrowUp", true)).toBe(true);
    const plan = store.getState().plan!;
    expect(plan.objects.d1!.position).toEqual([2010, 1600, 0]);
    expect(plan.objects.m1!.position.slice(0, 2)).toEqual([2010, 1800]);
  });

  it("a run of presses is one step to undo, and one change to save", () => {
    const { store, interaction } = editing();
    store.getState().select(["d1"]);
    for (let i = 0; i < 5; i++) {
      interaction.key("ArrowLeft");
      vi.advanceTimersByTime(NUDGE_RUN_MS - 100);
    }
    expect(store.getState().plan!.objects.d1!.position[0]).toBe(1950);
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().pending).toHaveLength(1);
    store.getState().undo();
    expect(store.getState().plan!.objects.d1!.position[0]).toBe(2000);
  });

  it("a pause, or another selection, starts a new step", () => {
    const { store, interaction } = editing();
    store.getState().select(["d1"]);
    interaction.key("ArrowLeft");
    vi.advanceTimersByTime(NUDGE_RUN_MS + 1);
    interaction.key("ArrowLeft");
    store.getState().select(["w1"]); // another selection
    interaction.key("ArrowLeft");
    expect(store.getState().undoStack).toHaveLength(3);
  });

  it("any other action ends the run too: an undo", () => {
    const { store, interaction } = editing();
    store.getState().select(["d1"]);
    interaction.key("ArrowLeft");
    store.getState().undo();
    interaction.key("ArrowLeft"); // straight away, on the same selection
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().plan!.objects.d1!.position[0]).toBe(1990);
    store.getState().undo();
    expect(store.getState().plan!.objects.d1!.position[0]).toBe(2000);
  });

  it("any other action ends the run too: another edit", () => {
    const { store, interaction } = editing();
    store.getState().select(["d1"]);
    interaction.key("ArrowLeft");
    interaction.key("r"); // turns the desk: its own step
    interaction.key("ArrowLeft"); // straight away, on the same selection
    expect(store.getState().undoStack).toHaveLength(3);
  });

  it("a wall moves whole, and the wall joined to it stretches", () => {
    const { store, interaction } = editing();
    store.getState().select(["w1"]);
    interaction.key("ArrowDown", true);
    const plan = store.getState().plan!;
    expect(plan.walls.find((w) => w.id === "w1")!.a).toEqual([0, -100]);
    expect(plan.walls.find((w) => w.id === "w2")!.a).toEqual([4000, -100]);
  });

  it("a door slides along its wall; across it, nothing moves", () => {
    const { store, interaction } = editing();
    store.getState().select(["o1"]);
    expect(interaction.key("ArrowRight")).toBe(true);
    expect(store.getState().plan!.openings[0]!.offset_mm).toBe(510);
    expect(interaction.key("ArrowUp")).toBe(false);
  });

  it("does nothing without a selection, or with a drawing tool", () => {
    const { store, interaction } = editing();
    expect(interaction.key("ArrowRight")).toBe(false);
    store.getState().select(["d1"]);
    store.getState().setTool("wall");
    expect(interaction.key("ArrowRight")).toBe(false);
  });
});
