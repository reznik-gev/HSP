// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderApp, type Routes } from "@/test/renderApp";
import {
  page,
  STUB_BUILDING,
  STUB_SITE,
  stubFloor,
  stubLocationRoutes,
  stubPlan,
  stubSeat,
  stubZone,
} from "@/test/stubs";

/** A free desk and a bookable one on floor f3. */
const FREE = stubSeat("d1", "A-01");
const BOOKABLE = stubSeat("d3", "A-03", { allocation_mode: "bookable" });
const PLAN = stubPlan({
  version: 2,
  state: "published",
  zones: [
    stubZone(
      "Quiet room",
      [
        [0, 0],
        [4000, 0],
        [4000, 3000],
        [0, 3000],
      ],
      { id: "z1" },
    ),
  ],
});

/** The places to choose from, and the free seats; `asked` records each search's query. */
function backend(asked: URLSearchParams[]): Routes {
  return {
    ...stubLocationRoutes(),
    "GET /api/v1/sites": { status: 200, body: page([STUB_SITE]) },
    "GET /api/v1/buildings": { status: 200, body: page([STUB_BUILDING]) },
    "GET /api/v1/floors": { status: 200, body: page([stubFloor()]) },
    "GET /api/v1/floors/f3/versions/2": { status: 200, body: PLAN },
    "GET /api/v1/seats": (request) => {
      asked.push(new URL(request.url).searchParams);
      return { status: 200, body: page([FREE, BOOKABLE]) };
    },
  };
}

afterEach(cleanup);

describe("free seats (docs/0108)", () => {
  it("lists the seats free to assign or book, each with Show on plan", async () => {
    const asked: URLSearchParams[] = [];
    await renderApp("/seats/free", backend(asked));
    const table = await screen.findByRole("table", { name: "Free seats" });
    expect(within(table).getByRole("rowheader", { name: "A-01" })).toBeInTheDocument();
    expect(within(table).getByText("Bookable")).toBeInTheDocument();
    expect(
      within(table).getAllByRole("link", { name: /Show A-0\d on the floor plan/ }),
    ).toHaveLength(2);
    expect(asked.at(-1)?.get("status")).toBe("available");
  });

  it("narrows by place, down to a zone, and by kind", async () => {
    const asked: URLSearchParams[] = [];
    await renderApp("/seats/free", backend(asked));
    // Each list loads once the place above it is chosen.
    const choose = async (label: string, option: string) => {
      const select = await screen.findByLabelText(label);
      await within(select).findByRole("option", { name: option });
      await userEvent.selectOptions(select, option);
    };
    await choose("Site", "Tel Aviv HQ");
    await choose("Building", "Harbor Tower");
    await choose("Floor", "Floor 3");
    await choose("Zone", "Quiet room");
    await choose("Kind", "Bookable");
    const last = asked.at(-1)!;
    expect(Object.fromEntries(last)).toMatchObject({
      site_id: "s1",
      building_id: "b1",
      floor_id: "f3",
      zone_id: "z1",
      status: "bookable",
    });
  });

  it("choosing another site clears the building, floor and zone", async () => {
    const asked: URLSearchParams[] = [];
    await renderApp("/seats/free?site=s1&building=b1&floor=f3&zone=z1", backend(asked));
    await userEvent.selectOptions(await screen.findByLabelText("Site"), "All");
    expect(Object.fromEntries(asked.at(-1)!)).toEqual({ status: "available", limit: "50" });
  });

  it("is a click away from the seat search, and back", async () => {
    await renderApp("/seats", backend([]));
    await userEvent.click(await screen.findByRole("link", { name: "Free seats" }));
    expect(await screen.findByRole("heading", { name: "Free seats" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Find someone's seat" }));
    expect(await screen.findByRole("heading", { name: "Seats" })).toBeInTheDocument();
  });
});
