// @vitest-environment jsdom
/** The Properties panel, the units switch and the grid bar (docs/0045, docs/0047,
 *  docs/0089). */
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { countCalls, spyChangesets } from "@/test/editorStubs";
import { clickOnPlan } from "@/test/planPointer";
import { renderApp } from "@/test/renderApp";

const GRID_50_CM = { grid_mm: 500 };

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("panels and bars (docs/0089)", () => {
  it("the Properties panel labels a selected desk; a value that can't be used is explained", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    const panel = screen.getByRole("complementary", { name: "Properties" });
    expect(within(panel).getByText(/Select something on the plan/)).toBeVisible();
    clickOnPlan([2000, 1000]);
    expect(await within(panel).findByRole("heading", { name: "Item" })).toBeVisible();
    const label = within(panel).getByLabelText("Seat label");
    expect(label).toHaveValue("A-01");
    await userEvent.clear(label);
    await userEvent.type(label, "A-07{Enter}");
    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]!.ops).toEqual([
      { op: "update", kind: "object", id: "d1", data: { label: "A-07" } },
    ]);
    // Escape puts the old value back without saving.
    const relabel = within(panel).getByLabelText("Seat label");
    await userEvent.type(relabel, "-old{Escape}");
    expect(within(panel).getByLabelText("Seat label")).toHaveValue("A-07");
    const x = within(panel).getByLabelText("X");
    expect(x).toHaveValue("200"); // 2000 mm in centimetres
    await userEvent.clear(x);
    await userEvent.type(x, "far away{Enter}");
    expect(within(panel).getByRole("alert")).toHaveTextContent("Enter a length that fits");
    await new Promise((r) => setTimeout(r, 1200));
    expect(changesets).toHaveLength(1);
  });

  it("the units switch shows metres and saves the choice", async () => {
    const { routes } = spyChangesets();
    const { calls: sent } = await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    clickOnPlan([2000, 1000]);
    await userEvent.selectOptions(screen.getByLabelText("Units"), "Metres");
    expect(await screen.findByLabelText("X")).toHaveValue("2.00");
    await waitFor(() => expect(countCalls(sent, "PUT /api/v1/me/preferences")).toBe(1));
  });

  it("the grid bar starts at the saved grid size, saves a new one, and G toggles snapping", async () => {
    const { routes } = spyChangesets();
    const { calls: sent } = await renderApp("/floors/f3/edit", {
      ...routes,
      "GET /api/v1/me/preferences": { status: 200, body: GRID_50_CM },
    });
    await screen.findByText("Draft 3 · Saved");
    const size = screen.getByRole("combobox", { name: "Grid size" });
    await waitFor(() => expect(size).toHaveDisplayValue("50 cm"));
    expect(screen.getByTestId("grid")).toBeInTheDocument();
    await userEvent.selectOptions(size, "10 cm");
    await waitFor(() => expect(countCalls(sent, "PUT /api/v1/me/preferences")).toBe(1));
    const snap = screen.getByRole("button", { name: "Grid" });
    expect(snap).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("g");
    expect(snap).toHaveAttribute("aria-pressed", "false");
  });
});
