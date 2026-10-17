// @vitest-environment jsdom
/** Saving as you edit: autosave and Undo, Exit saving first, refused changes, and the
 *  editor's own checks (docs/0050, docs/0089 choice 3, docs/0090). */
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import {
  countCalls,
  spyChangesets,
  stubEditorRoutes,
  STUB_EDITED_DESK,
  stubFloor3Plan,
  withEditedDesk,
} from "@/test/editorStubs";
import { dragOnPlan } from "@/test/planPointer";
import { renderApp } from "@/test/renderApp";
import { stubProblem } from "@/test/stubs";

/** Draft 3 with a desk that has no seat use: the server would refuse it. */
const DRAFT_DESK_WITHOUT_USE = {
  ...stubFloor3Plan(3, "draft"),
  objects: [{ ...STUB_EDITED_DESK, allocation_mode: null }],
};
const CHANGESET_REFUSED = stubProblem(422, "changeset-invalid", {
  errors: [{ code: "invalid_field", message: "Bad position.", op_index: 0, element_id: "d1" }],
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("saving (docs/0050, docs/0089 choice 3)", () => {
  it("moving a desk saves it; Ctrl+Z moves it back and saves that too", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    dragOnPlan([2000, 1000], [3000, 1000]);
    expect(await screen.findByText("Draft 3 · Saving…")).toBeVisible();
    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]).toEqual({
      base_revision: 3,
      ops: [{ op: "update", kind: "object", id: "d1", data: { position: [3000, 1000, 0] } }],
    });
    expect(await screen.findByText("Draft 3 · Saved")).toBeVisible();

    await userEvent.keyboard("{Control>}z{/Control}");
    await waitFor(() => expect(changesets).toHaveLength(2), { timeout: 3000 });
    expect(changesets[1]).toMatchObject({
      base_revision: 4,
      ops: [{ data: { position: [2000, 1000, 0] } }],
    });
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("Exit saves what's waiting before leaving", async () => {
    const { routes, changesets } = spyChangesets();
    const { calls: sent } = await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    dragOnPlan([2000, 1000], [2500, 1000]);
    await userEvent.click(screen.getByRole("button", { name: "Exit" }));
    expect(await screen.findByRole("heading", { name: "Floor 3" })).toBeVisible();
    expect(changesets).toHaveLength(1);
    expect(countCalls(sent, "DELETE /api/v1/floors/f3/lock")).toBe(1);
  });

  it("a refused change is undone and listed in Problems; clicking it selects the desk", async () => {
    let loads = 0;
    await renderApp(
      "/floors/f3/edit",
      stubEditorRoutes({
        "GET /api/v1/floors/f3/draft": () => {
          loads++;
          return { status: 200, body: withEditedDesk(stubFloor3Plan(3, "draft")) };
        },
        "POST /api/v1/floors/f3/draft/changesets": CHANGESET_REFUSED,
      }),
    );
    await screen.findByText("Draft 3 · Saved");
    dragOnPlan([2000, 1000], [3000, 1000]);
    const panel = await screen.findByRole("complementary", { name: "Problems" }, { timeout: 3000 });
    expect(within(panel).getByText(/A value is out of range/)).toBeVisible();
    expect(screen.getByRole("tab", { name: /Problems\s*1/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText(/couldn't be saved, so it was undone/)).toBeVisible();
    expect(loads).toBe(1); // nothing reloaded
    // The desk is back where it was, and Undo has nothing left to take back.
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();

    await userEvent.click(within(panel).getByRole("button", { name: /A value is out of range/ }));
    await userEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect(screen.getByLabelText("X")).toHaveValue("200");
    await userEvent.click(screen.getByRole("tab", { name: /Problems/ }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByText(/No problems/)).toBeVisible();
  });

  it("the editor's own checks show in Problems while there's something to fix", async () => {
    await renderApp(
      "/floors/f3/edit",
      stubEditorRoutes({
        "GET /api/v1/floors/f3/draft": { status: 200, body: DRAFT_DESK_WITHOUT_USE },
      }),
    );
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("tab", { name: /Problems\s*1/ }));
    const panel = screen.getByRole("complementary", { name: "Problems" });
    expect(within(panel).getByText(/A seat needs a use/)).toBeVisible();
    expect(within(panel).queryByRole("button", { name: "Dismiss" })).toBeNull();
    // Fixing it in Properties clears it.
    await userEvent.click(within(panel).getByRole("button", { name: /A seat needs a use/ }));
    await userEvent.click(screen.getByRole("tab", { name: "Properties" }));
    await userEvent.selectOptions(screen.getByLabelText("Seat use"), "Bookable");
    expect(screen.getByRole("tab", { name: "Problems" })).toBeVisible();
  });
});
