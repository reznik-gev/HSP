// @vitest-environment jsdom
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import {
  stubPlan,
  stubDesk,
  stubLocationRoutes,
  page,
  ref,
  stubSeat,
  stubWall,
} from "@/test/stubs";
import { ADMIN, renderApp, type Routes } from "@/test/renderApp";

const PLAN = stubPlan({
  version: 2,
  state: "published",
  walls: [stubWall("w1", [0, 0], [8000, 0], { thickness_mm: 200 })],
  objects: [
    stubDesk("d1", [1000, 1000], { label: "A-01" }),
    stubDesk("d2", [3000, 1000], { label: "A-02" }),
    stubDesk("d3", [5000, 1000], { label: "A-03", allocation_mode: "bookable" }),
  ],
});

function backend(publishedVersion: number | null = 2): Routes {
  return {
    ...stubLocationRoutes(publishedVersion),
    "GET /api/v1/floors/f3/versions/2": { status: 200, body: PLAN },
    "GET /api/v1/zone-types": { status: 200, body: page([]) },
    "GET /api/v1/seats": {
      status: 200,
      body: page([
        stubSeat("d1", "A-01", {
          holder_person: {
            id: "p1",
            display_name: "Maya Shani",
            email: "maya@acme.example",
            primary_unit: ref("u1", "Platform"),
          },
        }),
        stubSeat("d2", "A-02", { holder_unit: ref("u2", "Vision") }),
      ]),
    },
  };
}

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("floor plan viewer (docs/0087)", () => {
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
  const people = {
    "GET /api/v1/people": {
      status: 200,
      body: {
        items: [
          {
            id: "p7",
            display_name: "Yoni Peretz",
            email: "yoni@acme.example",
            title: null,
            external_id: null,
            active: true,
            source: "manual",
            primary_unit_id: null,
            memberships: [],
          },
        ],
        next_cursor: null,
      },
    },
    "GET /api/v1/org-units": { status: 200, body: page([]) },
  };

  it("an admin reassigns Maya's seat to Yoni; the notice says Maya lost it; Undo puts her back", async () => {
    const { calls } = await renderApp("/floors/f3?seat=d1", {
      ...backend(),
      ...people,
      "PUT /api/v1/seats/d1/assignment": { status: 200, body: {} },
      // Undo checks the seat still has Yoni before putting Maya back.
      "GET /api/v1/seats/d1/assignment": {
        status: 200,
        body: { assignment: { holder_person_id: "p7", holder_unit_id: null } },
      },
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
      "DELETE /api/v1/seats/d1/assignment": { status: 200, body: { freed_seats: [] } },
    });
    const panel = await screen.findByRole("complementary", { name: "Seat details" });
    await userEvent.click(within(panel).getByRole("button", { name: "Unassign" }));
    expect(await screen.findByText("A-01 is free")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    cleanup();

    await renderApp("/floors/f3?seat=d1", {
      ...backend(),
      "GET /api/v1/auth/me": { status: 200, body: { ...ADMIN, is_admin: false } },
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
