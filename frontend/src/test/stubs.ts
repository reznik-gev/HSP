/**
 * Stubs shared by the tests, like pytest's conftest.py: small builders with realistic defaults,
 * so a test spells out only the values it actually checks (a desk's position or label, a
 * floor's published version) and everything else stays in one place.
 *
 * Naming follows the usual test-double vocabulary (https://martinfowler.com/bliki/TestDouble.html):
 * these are **stubs**, canned answers the stubbed API hands back (`stubPlan`, `STUB_SITE`, …), not
 * fakes (working shortcut implementations) or mocks (objects that check how they're called).
 * `page` and `ref` aren't doubles: they only build the API's response shapes.
 *
 * Plain data with no app imports, so both node tests (the editor core) and jsdom screen tests
 * can use it. The world they describe:
 *   Tel Aviv HQ (s1) › Harbor Tower (b1, code HT) › Floor 3 (f3)
 */
import type { Routes } from "./renderApp";

/** The API's list envelope (docs/0040), as a single page. */
export const page = <T>(items: T[]) => ({ items, next_cursor: null });

/** An `{ id, name }` reference, as the API nests sites, buildings, floors and units. */
export const ref = (id: string, name: string) => ({ id, name });

// --- Locations ------------------------------------------------------------------------------

export const STUB_SITE = { id: "s1", name: "Tel Aviv HQ" };
export const STUB_BUILDING = { id: "b1", name: "Harbor Tower", code: "HT", site_id: "s1" };
export const stubFloor = (publishedVersion: number | null = 2) => ({
  id: "f3",
  name: "Floor 3",
  building_id: "b1",
  published_version: publishedVersion,
});

/** What the floor page and the editor read to show where floor f3 is. */
export function stubLocationRoutes(publishedVersion: number | null = 2): Routes {
  return {
    "GET /api/v1/floors/f3": { status: 200, body: stubFloor(publishedVersion) },
    "GET /api/v1/buildings/b1": { status: 200, body: STUB_BUILDING },
    "GET /api/v1/sites/s1": { status: 200, body: STUB_SITE },
  };
}

// --- Catalog and zone types -----------------------------------------------------------------

/** A desk as a plan's catalog carries it (one revision of the item, docs/0021). */
export const STUB_DESK_ITEM = {
  id: "rev-desk",
  item_id: "i1",
  key: "desk",
  category: "desk",
  name: "Desk 160 x 80",
  shape: "box",
  width_mm: 1600,
  depth_mm: 800,
  height_mm: 740,
  color: null,
  is_seat: true,
  mountable: false,
  attaches_to_categories: [] as string[],
  footprint_blocks: true,
};

export const STUB_MONITOR_ITEM = {
  ...STUB_DESK_ITEM,
  id: "rev-mon",
  item_id: "i2",
  key: "monitor",
  category: "monitor",
  name: "Monitor",
  width_mm: 600,
  depth_mm: 200,
  height_mm: 450,
  is_seat: false,
  attaches_to_categories: ["desk"],
};

/** A catalog item as GET /catalog-items lists it. */
export const stubCatalogItemOut = (item: typeof STUB_DESK_ITEM) => ({
  id: item.item_id,
  key: item.key,
  name: item.name,
  category: item.category,
  builtin: true,
  archived_at: null,
  current_revision: { ...item, rev_no: 1, model_key: null },
});

export const STUB_ZONE_TYPES = [
  { id: "zt1", name: "Room", color: "#93c5fd", is_enclosed: true },
  { id: "zt2", name: "Meeting room", color: "#c4b5fd", is_enclosed: true },
];

// --- Plan elements (docs/0029, docs/0036) ---------------------------------------------------

type Point = [number, number];

export const stubWall = (id: string, a: Point, b: Point, over: object = {}) => ({
  id,
  a,
  b,
  thickness_mm: 150,
  height_mm: 3000,
  ...over,
});

export const stubDoor = (id: string, wallId: string, offset: number, over: object = {}) => ({
  id,
  wall_id: wallId,
  type: "door",
  offset_mm: offset,
  width_mm: 900,
  height_mm: 2100,
  sill_mm: 0,
  swing: "left_in",
  ...over,
});

/** A desk (a seat, assigned by default) centred on `at`. */
export const stubDesk = (id: string, at: Point, over: object = {}) => ({
  id,
  catalog_item_rev_id: STUB_DESK_ITEM.id,
  position: [at[0], at[1], 0],
  rotation_ddeg: 0,
  label: null as string | null,
  attached_to: null as string | null,
  allocation_mode: "assigned" as string | null,
  ...over,
});

/** A monitor standing on desk `on`. */
export const stubMonitor = (id: string, on: string, at: Point) => ({
  ...stubDesk(id, at),
  catalog_item_rev_id: STUB_MONITOR_ITEM.id,
  position: [at[0], at[1], 740],
  attached_to: on,
  allocation_mode: null,
});

export const stubZone = (id: string, boundary: Point[], over: object = {}) => ({
  id,
  name: id,
  zone_type_id: "zt1",
  parent_zone_id: null as string | null,
  boundary,
  ...over,
});

/** A whole floor plan as the API returns it; the catalog knows desks and monitors. */
export const stubPlan = (over: object = {}) => ({
  floor_id: "f3",
  version: 1,
  state: "draft",
  revision: 1,
  walls: [] as object[],
  openings: [] as object[],
  columns: [] as object[],
  zones: [] as object[],
  objects: [] as object[],
  catalog: {
    [STUB_DESK_ITEM.id]: STUB_DESK_ITEM,
    [STUB_MONITOR_ITEM.id]: STUB_MONITOR_ITEM,
  } as Record<string, object>,
  ...over,
});

// --- Seats (GET /seats, docs/0085) ----------------------------------------------------------

/** A seat on floor f3; `holder` sets holder_person or holder_unit. */
export const stubSeat = (id: string, label: string, holder: object = {}) => ({
  id,
  label,
  allocation_mode: "assigned",
  site: ref(STUB_SITE.id, STUB_SITE.name),
  building: ref(STUB_BUILDING.id, STUB_BUILDING.name),
  floor: ref("f3", "Floor 3"),
  holder_person: null,
  holder_unit: null,
  ...holder,
});
