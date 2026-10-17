// @vitest-environment jsdom
/** Drawing on the plan: the wall, door, zone and item tools, typed lengths, and the wall
 *  length on the plan (docs/0089, docs/0092). */
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { spyChangesets } from "@/test/editorStubs";
import { clickOnPlan } from "@/test/planPointer";
import { renderApp } from "@/test/renderApp";

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("drawing (docs/0089, docs/0092)", () => {
  it("the Wall tool draws a wall corner to corner and saves it", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    expect(screen.getByRole("button", { name: "Wall" })).toHaveAttribute("aria-pressed", "true");
    clickOnPlan([0, 3000]);
    clickOnPlan([4000, 3000]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]!.ops).toEqual([
      {
        op: "add",
        kind: "wall",
        id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
        data: { a: [0, 3000], b: [4000, 3000], thickness_mm: 150, height_mm: 3000 },
      },
    ]);
    // V goes back to Select.
    await userEvent.keyboard("v");
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
  });

  it("D picks the Door tool; clicking a wall places a door on it", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.keyboard("d");
    expect(screen.getByRole("button", { name: "Door" })).toHaveAttribute("aria-pressed", "true");
    clickOnPlan([6000, 0]);
    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]!.ops).toEqual([
      expect.objectContaining({
        op: "add",
        kind: "opening",
        data: expect.objectContaining({ wall_id: "w1", type: "door", offset_mm: 5550 }) as unknown,
      }),
    ]);
  });

  it("Z picks the Zone tool with a zone type; the outline becomes a zone of that type", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.keyboard("z");
    const type = screen.getByRole("combobox", { name: "Zone type" });
    expect(type).toHaveDisplayValue("Room");
    await userEvent.selectOptions(type, "Meeting room");
    for (const p of [
      [0, 2000],
      [3000, 2000],
      [3000, 4000],
    ] as const) {
      clickOnPlan([p[0], p[1]]);
    }
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]!.ops[0]).toMatchObject({
      op: "add",
      kind: "zone",
      data: { name: "Meeting room 1", zone_type_id: "zt2" },
    });
  });

  it("P opens the catalog; a chosen desk is placed where clicked", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.keyboard("p");
    expect(await screen.findByRole("heading", { name: "Desks" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Desk 160 x 80/ }));
    clickOnPlan([5000, 3000]);
    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]!.ops[0]).toMatchObject({
      op: "add",
      kind: "object",
      data: {
        catalog_item_rev_id: "rev-desk",
        position: [5000, 3000, 0],
        allocation_mode: "assigned",
      },
    });
  });

  it("typing a length while drawing a wall opens a box; Enter places the corner exactly", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.keyboard("w");
    clickOnPlan([0, 3000]);
    // "3" opens the box with it; the rest goes into the box, not to the tool shortcuts.
    await userEvent.keyboard("3");
    const box = screen.getByRole("group", { name: "Exact measurement" });
    expect(within(box).getByLabelText("Length")).toHaveValue("3");
    await userEvent.keyboard("50cm");
    await userEvent.click(within(box).getByLabelText("Angle"));
    await userEvent.keyboard("90{Enter}");
    expect(screen.queryByRole("group", { name: "Exact measurement" })).toBeNull();
    expect(screen.getByRole("button", { name: "Wall" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]!.ops[0]).toMatchObject({ data: { a: [0, 3000], b: [0, 6500] } });
  });

  it("a selected wall shows its length on the plan; clicking it lets you type a new one", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    clickOnPlan([6000, 50]);
    await userEvent.click(
      await screen.findByRole("button", { name: "Length on the plan: 800 cm. Click to change." }),
    );
    const input = screen.getByRole("textbox", { name: "Length on the plan" });
    expect(input).toHaveValue("800");
    await userEvent.clear(input);
    await userEvent.type(input, "600{Enter}");
    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]!.ops).toEqual([
      { op: "update", kind: "wall", id: "w1", data: { b: [6000, 0] } },
    ]);
    expect(
      await screen.findByRole("button", { name: "Length on the plan: 600 cm. Click to change." }),
    ).toBeVisible();
  });
});
