// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import {
  stubPlan,
  stubDesk,
  stubLocationRoutes,
  page,
  ref,
  STUB_MAYA,
  stubAssignment,
  stubPerson,
  stubPersonHolder,
  stubMonitor,
  stubSeat,
  stubWall,
} from "@/test/stubs";
import { STUB_LOCK_DANA, STUB_LOCK_FREE } from "@/test/editorStubs";
import { AS_VIEWER, renderApp, type Reply, type Routes } from "@/test/renderApp";

const PLAN = stubPlan({
  version: 2,
  state: "published",
  walls: [stubWall("w1", [0, 0], [8000, 0], { thickness_mm: 200 })],
  objects: [
    stubDesk("d1", [1000, 1000], { label: "A-01" }),
    stubDesk("d2", [3000, 1000], { label: "A-02" }),
    stubDesk("d3", [5000, 1000], { label: "A-03", allocation_mode: "bookable" }),
    stubMonitor("m1", "d3", [5000, 1200]),
  ],
});

const YONI = stubPerson("p7", "Yoni Peretz");
/** What the person picker searches: Yoni, and no teams. */
const PEOPLE_TO_PICK: Routes = {
  "GET /api/v1/people": { status: 200, body: page([YONI]) },
  "GET /api/v1/org-units": { status: 200, body: page([]) },
};
const NOTHING_ELSE_FREED = { freed_seats: [] };

function backend(publishedVersion: number | null = 2): Routes {
  return {
    ...stubLocationRoutes(publishedVersion),
    "GET /api/v1/floors/f3/versions/2": { status: 200, body: PLAN },
    "GET /api/v1/zone-types": { status: 200, body: page([]) },
    "GET /api/v1/seats": {
      status: 200,
      body: page([
        stubSeat("d1", "A-01", stubPersonHolder(STUB_MAYA)),
        stubSeat("d2", "A-02", { holder_unit: ref("u2", "Vision") }),
      ]),
    },
  };
}

/** What the floor's polls see (docs/0041): a test moves these on, as another admin would. */
interface Elsewhere {
  published: number;
  lock: typeof STUB_LOCK_FREE | typeof STUB_LOCK_DANA;
}

/** Nothing has happened elsewhere yet: version 2 is published and nobody is editing. */
const quietElsewhere = (): Elsewhere => ({ published: 2, lock: STUB_LOCK_FREE });

/** The floor and its lock as `elsewhere` says, and version 3 of the plan once it's published. */
function polledRoutes(elsewhere: Elsewhere): Routes {
  return {
    "GET /api/v1/floors/f3": () =>
      stubLocationRoutes(elsewhere.published)["GET /api/v1/floors/f3"] as Reply,
    "GET /api/v1/floors/f3/versions/3": { status: 200, body: { ...PLAN, version: 3 } },
    "GET /api/v1/floors/f3/lock": () => ({ status: 200, body: elsewhere.lock }),
  };
}

afterEach(async () => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("floor plan viewer (docs/0087)", () => {
  it("picks up a version published elsewhere within 30 s (docs/0041)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const elsewhere = quietElsewhere();
    await renderApp("/floors/f3", { ...backend(), ...polledRoutes(elsewhere) });
    expect(await screen.findByText("Published version 2")).toBeInTheDocument();
    elsewhere.published = 3;
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(await screen.findByText("Published version 3")).toBeInTheDocument();
  });

  it("shows within 15 s that someone started editing (docs/0041)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const elsewhere = quietElsewhere();
    await renderApp("/floors/f3", { ...backend(), ...polledRoutes(elsewhere) });
    expect(await screen.findByRole("link", { name: "Edit floor" })).toBeInTheDocument();
    elsewhere.lock = STUB_LOCK_DANA;
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(await screen.findByText(/^Being edited by Dana Levi/)).toBeInTheDocument();
  });

  it("shows where the floor is, with a seat legend", async () => {
    await renderApp("/floors/f3", backend());
    expect(await screen.findByRole("heading", { name: "Floor 3" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Location" })).toHaveTextContent(
      "Floors›Tel Aviv HQ›Harbor Tower",
    );
    expect(screen.getByText("Published version 2")).toBeInTheDocument();
    const legend = await screen.findByRole("list", { name: "Seat colours" });
    expect(legend).toHaveTextContent("Assigned");
    expect(legend).toHaveTextContent("Bookable");
  });

  it("a link to a seat opens it with its holder; closing clears it", async () => {
    await renderApp("/floors/f3?seat=d1", backend());
    const panel = await screen.findByRole("complementary", { name: "Seat details" });
    expect(panel).toHaveTextContent("A-01");
    expect(panel).toHaveTextContent("Maya Shani");
    expect(panel).toHaveTextContent("Platform");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("complementary", { name: "Seat details" })).toBeNull();
  });

  it("a link to an item that isn't a seat (a device's monitor) highlights it", async () => {
    await renderApp("/floors/f3?seat=m1", backend());
    await screen.findByRole("heading", { name: "Floor 3" });
    await waitFor(() =>
      expect(document.querySelector("svg[data-lod] .plan-selected")).not.toBeNull(),
    );
    expect(screen.queryByRole("complementary", { name: "Seat details" })).toBeNull();
  });

  it("seats reserved for a team, and bookable ones, say so", async () => {
    await renderApp("/floors/f3?seat=d2", backend());
    expect(await screen.findByText("Reserved for Vision")).toBeInTheDocument();
    cleanup();
    await renderApp("/floors/f3?seat=d3", backend());
    expect(
      await screen.findByText("Booked by the day; not assigned to anyone."),
    ).toBeInTheDocument();
  });

  it("a floor without a published plan says so", async () => {
    await renderApp("/floors/f3", backend(null));
    expect(await screen.findByText("This floor has no published plan yet.")).toBeInTheDocument();
  });

  it("explains a failure to load", async () => {
    await renderApp("/floors/f3", {
      ...backend(),
      "GET /api/v1/floors/f3/versions/2": { status: 500 },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this floor");
  });
});

describe("assigning seats on the plan (docs/0088)", () => {
  it("an admin reassigns Maya's seat to Yoni; the notice says Maya lost it; Undo puts her back", async () => {
    const { calls } = await renderApp("/floors/f3?seat=d1", {
      ...backend(),
      ...PEOPLE_TO_PICK,
      "PUT /api/v1/seats/d1/assignment": { status: 200, body: {} },
      // Undo checks the seat still has Yoni before putting Maya back.
      "GET /api/v1/seats/d1/assignment": stubAssignment({ holder_person_id: YONI.id }),
    });
    const panel = await screen.findByRole("complementary", { name: "Seat details" });
    await userEvent.click(within(panel).getByRole("button", { name: "Change" }));
    await userEvent.type(within(panel).getByRole("combobox", { name: "Person or team" }), "yoni");
    await userEvent.click(await within(panel).findByRole("option", { name: /Yoni Peretz/ }));
    expect(await screen.findByText("A-01 assigned to Yoni Peretz")).toBeInTheDocument();
    expect(screen.getByText("Maya Shani no longer has this seat")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("A-01 is back as it was")).toBeInTheDocument();
    const puts = await Promise.all(
      calls.filter((r) => r.method === "PUT").map(async (r) => (await r.json()) as unknown),
    );
    expect(puts).toEqual([{ person_id: "p7" }, { person_id: "p1" }]);
  });

  it("freeing a seat offers Undo; viewers see no seat actions", async () => {
    await renderApp("/floors/f3?seat=d1", {
      ...backend(),
      "DELETE /api/v1/seats/d1/assignment": { status: 200, body: NOTHING_ELSE_FREED },
    });
    const panel = await screen.findByRole("complementary", { name: "Seat details" });
    await userEvent.click(within(panel).getByRole("button", { name: "Unassign" }));
    expect(await screen.findByText("A-01 is free")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    cleanup();

    await renderApp("/floors/f3?seat=d1", {
      ...backend(),
      ...AS_VIEWER,
    });
    const viewerPanel = await screen.findByRole("complementary", { name: "Seat details" });
    expect(within(viewerPanel).queryByRole("button", { name: "Change" })).toBeNull();
  });

  it("bookable seats aren't assigned from the plan", async () => {
    await renderApp("/floors/f3?seat=d3", backend());
    const panel = await screen.findByRole("complementary", { name: "Seat details" });
    expect(within(panel).queryByRole("button", { name: "Assign" })).toBeNull();
  });
});
