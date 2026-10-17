// @vitest-environment jsdom
/** Opening the editor: the edit lock, someone else editing, and Edit floor on the floor
 *  page (docs/0016, docs/0089). */
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import {
  countCalls,
  STUB_LOCK_DANA,
  STUB_LOCK_MINE,
  STUB_NO_DRAFT,
  stubEditorRoutes,
} from "@/test/editorStubs";
import { AS_VIEWER, renderApp } from "@/test/renderApp";
import { stubProblem } from "@/test/stubs";

import { HEARTBEAT_MS } from "../session/lock";

const FLOOR_LOCKED = stubProblem(423, "floor-locked");
const FORBIDDEN = stubProblem(403, "forbidden");

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("opening the editor (docs/0089)", () => {
  it("takes the lock and opens the draft, full screen", async () => {
    const { calls: sent } = await renderApp("/floors/f3/edit", stubEditorRoutes());
    expect(await screen.findByRole("heading", { name: "Editing Floor 3" })).toBeVisible();
    expect(await screen.findByText("Draft 3 · Saved")).toBeVisible();
    expect(countCalls(sent, "POST /api/v1/floors/f3/lock")).toBe(1);
    // No app sidebar: the editor has the whole window.
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("without a draft, starts from the published plan, or from nothing", async () => {
    await renderApp(
      "/floors/f3/edit",
      stubEditorRoutes({ "GET /api/v1/floors/f3/draft": STUB_NO_DRAFT }),
    );
    expect(await screen.findByText("Published version 2 · no changes yet")).toBeVisible();
    cleanup();
    await renderApp(
      "/floors/f3/edit",
      stubEditorRoutes({ "GET /api/v1/floors/f3/draft": STUB_NO_DRAFT }, null),
    );
    expect(await screen.findByText("Not published yet")).toBeVisible();
  });

  it("Exit goes back to the floor and releases the lock", async () => {
    const { calls: sent } = await renderApp("/floors/f3/edit", stubEditorRoutes());
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("button", { name: "Exit" }));
    expect(await screen.findByRole("heading", { name: "Floor 3" })).toBeVisible();
    expect(countCalls(sent, "DELETE /api/v1/floors/f3/lock")).toBe(1);
  });

  it("in Hebrew", async () => {
    await act(() => i18n.changeLanguage("he"));
    await renderApp("/floors/f3/edit", stubEditorRoutes());
    expect(await screen.findByRole("heading", { name: "עריכת Floor 3" })).toBeVisible();
    expect(await screen.findByText("טיוטה 3 · נשמר")).toBeVisible();
  });
});

describe("when someone else is editing (docs/0016)", () => {
  it("says who, and Take over removes their lock and opens the editor", async () => {
    let lockedByDana = true;
    const { calls: sent } = await renderApp(
      "/floors/f3/edit",
      stubEditorRoutes({
        "POST /api/v1/floors/f3/lock": () =>
          lockedByDana ? FLOOR_LOCKED : { status: 200, body: STUB_LOCK_MINE },
        "GET /api/v1/floors/f3/lock": { status: 200, body: STUB_LOCK_DANA },
        "POST /api/v1/floors/f3/lock/force-release": () => {
          lockedByDana = false;
          return { status: 204 };
        },
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Being edited by Dana Levi since/);
    expect(countCalls(sent, "GET /api/v1/floors/f3/draft")).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "Take over" }));
    expect(await screen.findByText("Draft 3 · Saved")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a refused heartbeat stops editing; Try again takes the lock back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let taken = false;
    await renderApp(
      "/floors/f3/edit",
      stubEditorRoutes({
        "POST /api/v1/floors/f3/lock": () =>
          taken ? FLOOR_LOCKED : { status: 200, body: STUB_LOCK_MINE },
      }),
    );
    await screen.findByText("Draft 3 · Saved");
    taken = true;
    await act(() => vi.advanceTimersByTimeAsync(HEARTBEAT_MS));
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Editing stopped/);
    taken = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await vi.waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("viewers can't edit", async () => {
    await renderApp(
      "/floors/f3/edit",
      stubEditorRoutes({
        ...AS_VIEWER,
        "POST /api/v1/floors/f3/lock": FORBIDDEN,
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only administrators can edit floors.",
    );
  });
});

describe("Edit floor on the floor page (docs/0089)", () => {
  it("opens the editor", async () => {
    await renderApp("/floors/f3", stubEditorRoutes());
    await userEvent.click(await screen.findByRole("link", { name: "Edit floor" }));
    expect(await screen.findByRole("heading", { name: "Editing Floor 3" })).toBeVisible();
  });

  it("while Dana edits, says so and offers Take over", async () => {
    await renderApp(
      "/floors/f3",
      stubEditorRoutes({ "GET /api/v1/floors/f3/lock": { status: 200, body: STUB_LOCK_DANA } }),
    );
    expect(await screen.findByText(/^Being edited by Dana Levi since/)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Edit floor" })).toBeNull();
    expect(screen.getByRole("button", { name: "Take over" })).toBeEnabled();
  });

  it("viewers see no Edit floor", async () => {
    await renderApp("/floors/f3", stubEditorRoutes({ ...AS_VIEWER }));
    await screen.findByRole("heading", { name: "Floor 3" });
    expect(screen.queryByRole("link", { name: "Edit floor" })).toBeNull();
  });
});
