// @vitest-environment jsdom
/** Laying out many seats: Array, seat numbering, and copy and paste (docs/0049,
 *  docs/0092). */
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { spyChangesets } from "@/test/editorStubs";
import { clickOnPlan } from "@/test/planPointer";
import { renderApp } from "@/test/renderApp";
import { page, ref, stubSeat } from "@/test/stubs";

/** HT-3-01, already used on another floor of the building. */
const SEAT_ON_FLOOR_2 = { ...stubSeat("x9", "HT-3-01"), floor: ref("f2", "Floor 2") };

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("layout tools (docs/0049, docs/0092)", () => {
  it("Array… previews rows × columns of the desk and creates them as one change", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    clickOnPlan([2000, 1000]);
    await userEvent.click(await screen.findByRole("button", { name: "Array…" }));
    const form = screen.getByRole("form", { name: "Array" });
    expect(within(form).getByLabelText("Column spacing")).toHaveValue("160");
    await userEvent.clear(within(form).getByLabelText("Rows"));
    await userEvent.type(within(form).getByLabelText("Rows"), "2");
    await userEvent.clear(within(form).getByLabelText("Columns"));
    await userEvent.type(within(form).getByLabelText("Columns"), "3");
    expect(within(form).getByText("6 items in all, counting the ones selected")).toBeVisible();
    expect(screen.getAllByTestId("array-copy")).toHaveLength(5);
    await userEvent.click(within(form).getByRole("button", { name: "Create" }));
    expect(screen.queryAllByTestId("array-copy")).toHaveLength(0);
    expect(await screen.findByRole("heading", { name: "6 items" })).toBeVisible();
    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]!.ops).toHaveLength(5);
    expect(changesets[0]!.ops[0]).toMatchObject({
      op: "add",
      kind: "object",
      data: { position: [3600, 1000, 0], label: null },
    });
  });

  it("L numbers seats from the building and floor: HT-3-01, skipping labels in use", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", {
      ...routes,
      "GET /api/v1/seats": { status: 200, body: page([SEAT_ON_FLOOR_2]) },
    });
    await screen.findByText("Draft 3 · Saved");
    await userEvent.keyboard("l");
    expect(screen.getByLabelText("Pattern")).toHaveValue("HT-3-{01}");
    expect(await screen.findByText("Next: HT-3-02")).toBeVisible();
    clickOnPlan([2000, 1000]);
    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]!.ops).toEqual([
      { op: "update", kind: "object", id: "d1", data: { label: "HT-3-02" } },
    ]);
    expect(screen.getByText("Next: HT-3-03")).toBeVisible();
  });

  it("Ctrl+C then Ctrl+V pastes a copy in place, without the seat label", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    clickOnPlan([2000, 1000]);
    await userEvent.keyboard("{Control>}c{/Control}");
    expect(await screen.findByText("Copied 1 element")).toBeVisible();
    await userEvent.keyboard("{Control>}v{/Control}");
    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]!.ops).toEqual([
      expect.objectContaining({
        op: "add",
        kind: "object",
        data: expect.objectContaining({ position: [2000, 1000, 0], label: null }) as unknown,
      }),
    ]);
    // The copy is selected, and its label is empty.
    expect(screen.getByLabelText("Seat label")).toHaveValue("");
  });
});
