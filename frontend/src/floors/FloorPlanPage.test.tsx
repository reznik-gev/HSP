// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { renderApp, type Routes } from "@/test/renderApp";

const DESK = {
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
const desk = (id: string, x: number, label: string, mode = "assigned") => ({
  id,
  catalog_item_rev_id: "rev-desk",
  position: [x, 1000, 0],
  rotation_ddeg: 0,
  label,
  allocation_mode: mode,
});
const PLAN = {
  floor_id: "f3",
  version: 2,
  state: "published",
  revision: 1,
  walls: [{ id: "w1", a: [0, 0], b: [8000, 0], thickness_mm: 200, height_mm: 3000 }],
  openings: [],
  columns: [],
  zones: [],
  objects: [
    desk("d1", 1000, "A-01"),
    desk("d2", 3000, "A-02"),
    desk("d3", 5000, "A-03", "bookable"),
  ],
  catalog: { "rev-desk": DESK },
};
const ref = (id: string, name: string) => ({ id, name });
const seat = (id: string, label: string, holder: object) => ({
  id,
  label,
  allocation_mode: "assigned",
  site: ref("s1", "Tel Aviv HQ"),
  building: ref("b1", "Harbor Tower"),
  floor: ref("f3", "Floor 3"),
  holder_person: null,
  holder_unit: null,
  ...holder,
});

function backend(publishedVersion: number | null = 2): Routes {
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
    "GET /api/v1/floors/f3/versions/2": { status: 200, body: PLAN },
    "GET /api/v1/zone-types": { status: 200, body: { items: [], next_cursor: null } },
    "GET /api/v1/seats": {
      status: 200,
      body: {
        items: [
          seat("d1", "A-01", {
            holder_person: {
              id: "p1",
              display_name: "Maya Shani",
              email: "maya@acme.example",
              primary_unit: ref("u1", "Platform"),
            },
          }),
          seat("d2", "A-02", { holder_unit: ref("u2", "Vision") }),
        ],
        next_cursor: null,
      },
    },
  };
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  // jsdom has no layout: report a fixed canvas size.
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
