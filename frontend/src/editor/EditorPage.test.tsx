// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
const DESK_ITEM = {
  id: "rev-desk",
  item_id: "i1",
  key: "desk",
  category: "desk",
  name: "Desk",
  shape: "box",
  width_mm: 1600,
  depth_mm: 800,
  height_mm: 740,
  color: null,
  is_seat: true,
  mountable: false,
  attaches_to_categories: [],
  footprint_blocks: true,
};
const DESK = {
  id: "d1",
  catalog_item_rev_id: "rev-desk",
  position: [2000, 1000, 0],
  rotation_ddeg: 0,
  label: "A-01",
  allocation_mode: "assigned",
};
const withDesk = (p: ReturnType<typeof plan>) => ({
  ...p,
  objects: [DESK],
  catalog: { "rev-desk": DESK_ITEM },
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
    "GET /api/v1/zone-types": {
      status: 200,
      body: {
        items: [
          { id: "zt1", name: "Room", color: "#93c5fd", is_enclosed: true },
          { id: "zt2", name: "Meeting room", color: "#c4b5fd", is_enclosed: true },
        ],
        next_cursor: null,
      },
    },
    "GET /api/v1/catalog-items": {
      status: 200,
      body: {
        items: [
          {
            id: "i1",
            key: "desk",
            name: "Desk 160 x 80",
            category: "desk",
            builtin: true,
            archived_at: null,
            current_revision: { ...DESK_ITEM, rev_no: 1, model_key: null },
          },
        ],
        next_cursor: null,
      },
    },
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
    expect(await screen.findByText("Draft 3 · Saved")).toBeVisible();
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
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("button", { name: "Exit" }));
    expect(await screen.findByRole("heading", { name: "Floor 3" })).toBeVisible();
    expect(calls(sent, "DELETE /api/v1/floors/f3/lock")).toBe(1);
  });

  it("in Hebrew", async () => {
    await act(() => i18n.changeLanguage("he"));
    await renderApp("/floors/f3/edit", backend());
    expect(await screen.findByRole("heading", { name: "עריכת Floor 3" })).toBeVisible();
    expect(await screen.findByText("טיוטה 3 · נשמר")).toBeVisible();
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
    expect(await screen.findByText("Draft 3 · Saved")).toBeVisible();
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

/** Where a plan point is on the 800 × 600 test canvas, read from the SVG's viewBox. */
function onScreen(x: number, y: number): { clientX: number; clientY: number } {
  const svg = document.querySelector("svg[data-lod]")!;
  const [vx, vy, vw, vh] = svg.getAttribute("viewBox")!.split(" ").map(Number) as [
    number,
    number,
    number,
    number,
  ];
  // The plan's +Y is north, drawn upwards: SVG y is -y (docs/0042).
  return { clientX: ((x - vx) / vw) * 800, clientY: ((-y - vy) / vh) * 600 };
}

function click(at: [number, number]) {
  const svg = document.querySelector("svg[data-lod]")!;
  const p = onScreen(...at);
  fireEvent.pointerDown(svg, { ...p, button: 0, pointerId: 1 });
  fireEvent.pointerUp(svg, { ...p, button: 0, pointerId: 1 });
}

function drag(from: [number, number], to: [number, number]) {
  const svg = document.querySelector("svg[data-lod]")!;
  const a = onScreen(...from);
  const b = onScreen(...to);
  fireEvent.pointerDown(svg, { ...a, button: 0, pointerId: 1 });
  fireEvent.pointerMove(svg, { ...b, button: 0, buttons: 1, pointerId: 1 });
  fireEvent.pointerUp(svg, { ...b, button: 0, pointerId: 1 });
}

describe("editing and saving (docs/0050, docs/0089 choice 3)", () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = () => {};
    // jsdom has no PointerEvent; a MouseEvent carries the same coordinates and buttons.
    if (!("PointerEvent" in window)) {
      vi.stubGlobal(
        "PointerEvent",
        class extends MouseEvent {
          readonly pointerId: number;
          constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 1;
          }
        },
      );
    }
  });

  function saving() {
    const changesets: { base_revision: number; ops: { data?: unknown }[] }[] = [];
    let revision = 3;
    const routes = backend({
      "GET /api/v1/floors/f3/draft": { status: 200, body: withDesk(plan(3, "draft")) },
      "POST /api/v1/floors/f3/draft/changesets": (request) => {
        void request.json().then((b) => changesets.push(b as never));
        return {
          status: 200,
          body: { floor_id: "f3", version: 3, revision: ++revision, cascaded: [] },
        };
      },
    });
    return { routes, changesets };
  }

  it("moving a desk saves it; Ctrl+Z moves it back and saves that too", async () => {
    const { routes, changesets } = saving();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    drag([2000, 1000], [3000, 1000]);
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

  it("the Wall tool draws a wall corner to corner and saves it", async () => {
    const { routes, changesets } = saving();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    expect(screen.getByRole("button", { name: "Wall" })).toHaveAttribute("aria-pressed", "true");
    click([0, 3000]);
    click([4000, 3000]);
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
    const { routes, changesets } = saving();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.keyboard("d");
    expect(screen.getByRole("button", { name: "Door" })).toHaveAttribute("aria-pressed", "true");
    click([6000, 0]);
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
    const { routes, changesets } = saving();
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
      click([p[0], p[1]]);
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
    const { routes, changesets } = saving();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.keyboard("p");
    expect(await screen.findByRole("heading", { name: "Desks" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Desk 160 x 80/ }));
    click([5000, 3000]);
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

  it("the Properties panel labels a selected desk; a value that can't be used is explained", async () => {
    const { routes, changesets } = saving();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    const panel = screen.getByRole("complementary", { name: "Properties" });
    expect(within(panel).getByText(/Select something on the plan/)).toBeVisible();
    click([2000, 1000]);
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
    const { routes } = saving();
    const { calls: sent } = await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    click([2000, 1000]);
    await userEvent.selectOptions(screen.getByLabelText("Units"), "Metres");
    expect(await screen.findByLabelText("X")).toHaveValue("2.00");
    await waitFor(() => expect(calls(sent, "PUT /api/v1/me/preferences")).toBe(1));
  });

  it("Exit saves what's waiting before leaving", async () => {
    const { routes, changesets } = saving();
    const { calls: sent } = await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    drag([2000, 1000], [2500, 1000]);
    await userEvent.click(screen.getByRole("button", { name: "Exit" }));
    expect(await screen.findByRole("heading", { name: "Floor 3" })).toBeVisible();
    expect(changesets).toHaveLength(1);
    expect(calls(sent, "DELETE /api/v1/floors/f3/lock")).toBe(1);
  });

  it("a refused change reloads the draft and says why", async () => {
    let loads = 0;
    await renderApp(
      "/floors/f3/edit",
      backend({
        "GET /api/v1/floors/f3/draft": () => {
          loads++;
          return { status: 200, body: withDesk(plan(3, "draft")) };
        },
        "POST /api/v1/floors/f3/draft/changesets": {
          status: 422,
          body: {
            type: "https://hsp.example/problems/changeset-invalid",
            title: "Invalid",
            detail: "The desk is off the floor.",
          },
        },
      }),
    );
    await screen.findByText("Draft 3 · Saved");
    drag([2000, 1000], [3000, 1000]);
    expect(
      await screen.findByText("The desk is off the floor.", {}, { timeout: 3000 }),
    ).toBeVisible();
    await waitFor(() => expect(loads).toBe(2));
  });
});
