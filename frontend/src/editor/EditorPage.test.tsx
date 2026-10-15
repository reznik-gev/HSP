// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import {
  stubPlan,
  stubCatalogItemOut,
  stubDesk,
  STUB_DESK_ITEM,
  stubLocationRoutes,
  page,
  stubSeat,
  stubWall,
  STUB_ZONE_TYPES,
} from "@/test/stubs";
import { ADMIN, renderApp, type Reply, type Routes } from "@/test/renderApp";

import { HEARTBEAT_MS } from "./session/lock";

// Floor 3 has one wall; version 2 is published and draft 3 is open, at revision 3.
const WALL = stubWall("w1", [0, 0], [8000, 0], { thickness_mm: 200 });
const plan = (version: number, state: string) =>
  stubPlan({ version, state, revision: 3, walls: [WALL] });
/** A desk at (2000, 1000), the one the tests drag, select and label. */
const DESK = stubDesk("d1", [2000, 1000], { label: "A-01" });
const withDesk = (p: ReturnType<typeof plan>) => ({ ...p, objects: [DESK] });
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
    ...stubLocationRoutes(publishedVersion),
    "GET /api/v1/zone-types": { status: 200, body: page(STUB_ZONE_TYPES) },
    "GET /api/v1/catalog-items": { status: 200, body: page([stubCatalogItemOut(STUB_DESK_ITEM)]) },
    "POST /api/v1/floors/f3/lock": {
      status: 200,
      body: { ...LOCK_FREE, locked: true, is_mine: true },
    },
    "GET /api/v1/floors/f3/lock": { status: 200, body: LOCK_FREE },
    "DELETE /api/v1/floors/f3/lock": { status: 204 },
    "GET /api/v1/floors/f3/draft": { status: 200, body: plan(3, "draft") },
    "GET /api/v1/floors/f3/versions/2": { status: 200, body: plan(2, "published") },
    "GET /api/v1/seats": { status: 200, body: page([]) },
    ...over,
  };
}

const NO_DRAFT: Reply = { status: 404, body: { type: "/problems/no-draft", title: "No draft" } };
const calls = (list: Request[], key: string) =>
  list.filter((r) => `${r.method} ${new URL(r.url).pathname}` === key).length;

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

  it("the grid bar starts at the saved grid size, saves a new one, and G toggles snapping", async () => {
    const { routes } = saving();
    const { calls: sent } = await renderApp("/floors/f3/edit", {
      ...routes,
      "GET /api/v1/me/preferences": { status: 200, body: { grid_mm: 500 } },
    });
    await screen.findByText("Draft 3 · Saved");
    const size = screen.getByRole("combobox", { name: "Grid size" });
    await waitFor(() => expect(size).toHaveDisplayValue("50 cm"));
    expect(screen.getByTestId("grid")).toBeInTheDocument();
    await userEvent.selectOptions(size, "10 cm");
    await waitFor(() => expect(calls(sent, "PUT /api/v1/me/preferences")).toBe(1));
    const snap = screen.getByRole("button", { name: "Grid" });
    expect(snap).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("g");
    expect(snap).toHaveAttribute("aria-pressed", "false");
  });

  it("typing a length while drawing a wall opens a box; Enter places the corner exactly", async () => {
    const { routes, changesets } = saving();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.keyboard("w");
    click([0, 3000]);
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
    const { routes, changesets } = saving();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    click([6000, 50]);
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

  it("Array… previews rows × columns of the desk and creates them as one change", async () => {
    const { routes, changesets } = saving();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    click([2000, 1000]);
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
    const { routes, changesets } = saving();
    await renderApp("/floors/f3/edit", {
      ...routes,
      // HT-3-01 is already used on another floor of the building.
      "GET /api/v1/seats": {
        status: 200,
        body: page([{ ...stubSeat("x9", "HT-3-01"), floor: { id: "f2", name: "Floor 2" } }]),
      },
    });
    await screen.findByText("Draft 3 · Saved");
    await userEvent.keyboard("l");
    expect(screen.getByLabelText("Pattern")).toHaveValue("HT-3-{01}");
    expect(await screen.findByText("Next: HT-3-02")).toBeVisible();
    click([2000, 1000]);
    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]!.ops).toEqual([
      { op: "update", kind: "object", id: "d1", data: { label: "HT-3-02" } },
    ]);
    expect(screen.getByText("Next: HT-3-03")).toBeVisible();
  });

  it("Ctrl+C then Ctrl+V pastes a copy in place, without the seat label", async () => {
    const { routes, changesets } = saving();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    click([2000, 1000]);
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

  it("the editor's own checks show in Problems while there's something to fix", async () => {
    await renderApp(
      "/floors/f3/edit",
      backend({
        // A desk without a seat use: the server would refuse it.
        "GET /api/v1/floors/f3/draft": {
          status: 200,
          body: { ...plan(3, "draft"), objects: [{ ...DESK, allocation_mode: null }] },
        },
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

  it("a refused change is undone and listed in Problems; clicking it selects the desk", async () => {
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
            title: "Invalid changeset",
            errors: [
              { code: "invalid_field", message: "Bad position.", op_index: 0, element_id: "d1" },
            ],
          },
        },
      }),
    );
    await screen.findByText("Draft 3 · Saved");
    drag([2000, 1000], [3000, 1000]);
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
});

describe("publishing, discarding and history (docs/0082, docs/0089)", () => {
  const EMPTY_DIFF = { added: [], changed: [], removed: [] };
  const holderSeat = stubSeat("d9", "B-02", {
    holder_person: { id: "p1", display_name: "Maya Cohen", email: "maya@acme.example" },
  });

  function publishing(publish: Reply) {
    const published: unknown[] = [];
    const routes = backend({
      "GET /api/v1/floors/f3/draft": { status: 200, body: withDesk(plan(3, "draft")) },
      "GET /api/v1/floors/f3/versions/2/diff/3": {
        status: 200,
        body: {
          floor_id: "f3",
          from_version: 2,
          to_version: 3,
          walls: EMPTY_DIFF,
          openings: EMPTY_DIFF,
          columns: EMPTY_DIFF,
          zones: EMPTY_DIFF,
          objects: { added: [DESK], changed: [], removed: [{ id: "d9" }] },
        },
      },
      "GET /api/v1/seats": { status: 200, body: page([holderSeat]) },
      "POST /api/v1/floors/f3/draft/publish": (request) => {
        void request.json().then((b) => published.push(b));
        return publish;
      },
    });
    return { routes, published };
  }

  it("Publish shows what changed and which seats it frees, then goes to the floor", async () => {
    const { routes, published } = publishing({
      status: 200,
      body: {
        floor_id: "f3",
        published_version: 3,
        superseded_version: 2,
        freed_seats: [{ seat_id: "d9" }],
      },
    });
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Publish Floor 3" });
    const lines = await within(dialog).findAllByRole("listitem");
    expect(lines.map((l) => l.textContent)).toEqual(
      expect.arrayContaining(["Added: 1 item", "Removed: 1 item"]),
    );
    expect(within(dialog).getByText("1 assigned seat will be freed:")).toBeVisible();
    expect(within(dialog).getByText(/B-02: Maya Cohen/)).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText(/Note/), "New desks");
    await userEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("heading", { name: "Floor 3" })).toBeVisible();
    expect(published).toEqual([{ base_revision: 3, note: "New desks" }]);
    expect(await screen.findByText("Floor 3 published as version 3")).toBeVisible();
  });

  it("publish conflicts are listed in Problems", async () => {
    const { routes } = publishing({
      status: 409,
      body: {
        type: "https://hsp.example/problems/publish-conflicts",
        title: "Can't publish",
        errors: [
          { code: "seat_label_duplicate", message: "A-01 is used twice.", element_id: "d1" },
        ],
      },
    });
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(await within(dialog).findByRole("button", { name: "Publish" }));
    const panel = await screen.findByRole("complementary", { name: "Problems" });
    expect(
      within(panel).getByText("Another seat in this building has the same label."),
    ).toBeVisible();
    expect(within(panel).getByText("Seat A-01")).toBeVisible();
  });

  it("Discard draft goes back to the published plan; Undo brings the draft back", async () => {
    let draft: unknown = withDesk(plan(3, "draft"));
    const restored: { base_revision: number; ops: { op: string; id: string }[] }[] = [];
    await renderApp(
      "/floors/f3/edit",
      backend({
        "GET /api/v1/floors/f3/draft": () => (draft ? { status: 200, body: draft } : NO_DRAFT),
        "DELETE /api/v1/floors/f3/draft": () => {
          draft = null;
          return { status: 204 };
        },
        "POST /api/v1/floors/f3/draft/changesets": (request) => {
          void request.json().then((b) => restored.push(b as never));
          draft = withDesk(plan(3, "draft"));
          return { status: 200, body: { floor_id: "f3", version: 3, revision: 4, cascaded: [] } };
        },
      }),
    );
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(await screen.findByText("Published version 2 · no changes yet")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Discard draft" })).toBeNull();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    const notice = (await screen.findByText(/Draft discarded/)).closest("li")!;
    await userEvent.click(within(notice).getByRole("button", { name: "Undo" }));
    // The published plan has the wall; the draft added the desk.
    expect(restored).toEqual([
      { base_revision: 0, ops: [expect.objectContaining({ op: "add", kind: "object", id: "d1" })] },
    ]);
  });

  it("History lists the versions; Restore waits for the draft to go", async () => {
    await renderApp(
      "/floors/f3/edit",
      backend({
        "GET /api/v1/floors/f3/versions": {
          status: 200,
          body: {
            items: [
              {
                version: 1,
                state: "superseded",
                revision: 2,
                created_at: "2026-10-01T09:00:00Z",
                created_by: "u-1",
                published_at: "2026-10-01T10:00:00Z",
                note: "First",
              },
              {
                version: 2,
                state: "published",
                revision: 5,
                created_at: "2026-10-10T09:00:00Z",
                created_by: "u-1",
                published_at: "2026-10-10T10:00:00Z",
                note: null,
              },
              {
                version: 3,
                state: "draft",
                revision: 3,
                created_at: "2026-10-15T09:00:00Z",
                created_by: "u-1",
                published_at: null,
                note: null,
              },
            ],
            next_cursor: null,
          },
        },
      }),
    );
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("button", { name: "Version history" }));
    const sheet = await screen.findByRole("dialog", { name: "Version history" });
    const items = await within(sheet).findAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Version 3 · Draft"),
      expect.stringContaining("Version 2 · Published"),
      expect.stringMatching(/Version 1 · Earlier.*First/),
    ]);
    expect(within(sheet).getByRole("button", { name: "Restore" })).toBeDisabled();
    expect(within(sheet).getByText(/Publish or discard the current draft/)).toBeVisible();
  });
});
