// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { ADMIN, renderApp, type Reply, type Routes } from "@/test/renderApp";

import { HEARTBEAT_MS } from "./session/lock";

const EMPTY = { walls: [], openings: [], columns: [], zones: [], objects: [], catalog: {} };
const WALL = { id: "w1", a: [0, 0], b: [8000, 0], thickness_mm: 200, height_mm: 3000 };
const plan = (version: number, state: string) => ({
  floor_id: "f3",
  version,
  state,
  revision: 3,
  ...EMPTY,
  walls: [WALL],
});
const LOCK_FREE = { floor_id: "f3", locked: false, is_mine: false };
const LOCK_DANA = {
  floor_id: "f3",
  locked: true,
  is_mine: false,
  holder_name: "Dana Levi",
  acquired_at: "2026-10-15T06:12:00Z",
};

function backend(over: Routes = {}, publishedVersion: number | null = 2): Routes {
  return {
    "GET /api/v1/floors/f3": {
      status: 200,
      body: { id: "f3", name: "Floor 3", building_id: "b1", published_version: publishedVersion },
    },
    "GET /api/v1/buildings/b1": {
      status: 200,
      body: { id: "b1", name: "Harbor Tower", code: "HT", site_id: "s1" },
    },
    "GET /api/v1/sites/s1": { status: 200, body: { id: "s1", name: "Tel Aviv HQ" } },
    "GET /api/v1/zone-types": { status: 200, body: { items: [], next_cursor: null } },
    "POST /api/v1/floors/f3/lock": {
      status: 200,
      body: { ...LOCK_FREE, locked: true, is_mine: true },
    },
    "GET /api/v1/floors/f3/lock": { status: 200, body: LOCK_FREE },
    "DELETE /api/v1/floors/f3/lock": { status: 204 },
    "GET /api/v1/floors/f3/draft": { status: 200, body: plan(3, "draft") },
    "GET /api/v1/floors/f3/versions/2": { status: 200, body: plan(2, "published") },
    "GET /api/v1/seats": { status: 200, body: { items: [], next_cursor: null } },
    ...over,
  };
}

const NO_DRAFT: Reply = { status: 404, body: { type: "/problems/no-draft", title: "No draft" } };
const calls = (list: Request[], key: string) =>
  list.filter((r) => `${r.method} ${new URL(r.url).pathname}` === key).length;

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb(
          [{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry],
          this as never,
        );
      }
      disconnect() {}
    },
  );
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("opening the editor (docs/0089)", () => {
  it("takes the lock and opens the draft, full screen", async () => {
    const { calls: sent } = await renderApp("/floors/f3/edit", backend());
    expect(await screen.findByRole("heading", { name: "Editing Floor 3" })).toBeVisible();
    expect(await screen.findByText("Draft 3")).toBeVisible();
    expect(calls(sent, "POST /api/v1/floors/f3/lock")).toBe(1);
    // No app sidebar: the editor has the whole window.
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("without a draft, starts from the published plan, or from nothing", async () => {
    await renderApp("/floors/f3/edit", backend({ "GET /api/v1/floors/f3/draft": NO_DRAFT }));
    expect(await screen.findByText("Published version 2 · no changes yet")).toBeVisible();
    cleanup();
    await renderApp("/floors/f3/edit", backend({ "GET /api/v1/floors/f3/draft": NO_DRAFT }, null));
    expect(await screen.findByText("Not published yet")).toBeVisible();
  });

  it("Exit goes back to the floor and releases the lock", async () => {
    const { calls: sent } = await renderApp("/floors/f3/edit", backend());
    await screen.findByText("Draft 3");
    await userEvent.click(screen.getByRole("link", { name: "Exit" }));
    expect(await screen.findByRole("heading", { name: "Floor 3" })).toBeVisible();
    expect(calls(sent, "DELETE /api/v1/floors/f3/lock")).toBe(1);
  });

  it("in Hebrew", async () => {
    await act(() => i18n.changeLanguage("he"));
    await renderApp("/floors/f3/edit", backend());
    expect(await screen.findByRole("heading", { name: "עריכת Floor 3" })).toBeVisible();
    expect(await screen.findByText("טיוטה 3")).toBeVisible();
  });
});

describe("when someone else is editing (docs/0016)", () => {
  it("says who, and Take over removes their lock and opens the editor", async () => {
    let lockedByDana = true;
    const { calls: sent } = await renderApp(
      "/floors/f3/edit",
      backend({
        "POST /api/v1/floors/f3/lock": () =>
          lockedByDana
            ? { status: 423, body: { type: "/problems/floor-locked", title: "Locked" } }
            : { status: 200, body: { ...LOCK_FREE, locked: true, is_mine: true } },
        "GET /api/v1/floors/f3/lock": { status: 200, body: LOCK_DANA },
        "POST /api/v1/floors/f3/lock/force-release": () => {
          lockedByDana = false;
          return { status: 204 };
        },
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Being edited by Dana Levi since/);
    expect(calls(sent, "GET /api/v1/floors/f3/draft")).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "Take over" }));
    expect(await screen.findByText("Draft 3")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a refused heartbeat stops editing; Try again takes the lock back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let taken = false;
    await renderApp(
      "/floors/f3/edit",
      backend({
        "POST /api/v1/floors/f3/lock": () =>
          taken
            ? { status: 423, body: { type: "/problems/floor-locked", title: "Locked" } }
            : { status: 200, body: { ...LOCK_FREE, locked: true, is_mine: true } },
      }),
    );
    await screen.findByText("Draft 3");
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
      backend({
        "GET /api/v1/auth/me": { status: 200, body: { ...ADMIN, is_admin: false } },
        "POST /api/v1/floors/f3/lock": { status: 403, body: { title: "Forbidden" } },
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only administrators can edit floors.",
    );
  });
});

describe("Edit floor on the floor page (docs/0089)", () => {
  it("opens the editor", async () => {
    await renderApp("/floors/f3", backend());
    await userEvent.click(await screen.findByRole("link", { name: "Edit floor" }));
    expect(await screen.findByRole("heading", { name: "Editing Floor 3" })).toBeVisible();
  });

  it("while Dana edits, says so and offers Take over", async () => {
    await renderApp(
      "/floors/f3",
      backend({ "GET /api/v1/floors/f3/lock": { status: 200, body: LOCK_DANA } }),
    );
    expect(await screen.findByText(/^Being edited by Dana Levi since/)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Edit floor" })).toBeNull();
    expect(screen.getByRole("button", { name: "Take over" })).toBeEnabled();
  });

  it("viewers see no Edit floor", async () => {
    await renderApp(
      "/floors/f3",
      backend({ "GET /api/v1/auth/me": { status: 200, body: { ...ADMIN, is_admin: false } } }),
    );
    await screen.findByRole("heading", { name: "Floor 3" });
    expect(screen.queryByRole("link", { name: "Edit floor" })).toBeNull();
  });
});
