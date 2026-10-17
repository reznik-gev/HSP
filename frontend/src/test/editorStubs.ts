/**
 * Stubs shared by the editor's screen tests (src/editor/tests, docs/0096): floor 3 being edited,
 * its locks and the API around it. Floor 3 has one wall; version 2 is published and draft 3 is
 * open at revision 3, with desk d1 in it when a test asks for it.
 */
import type { Routes } from "./renderApp";
import {
  page,
  STUB_DESK_ITEM,
  STUB_ZONE_TYPES,
  stubCatalogItemOut,
  stubDesk,
  stubLocationRoutes,
  stubPlan,
  stubProblem,
  stubWall,
} from "./stubs";

const STUB_FLOOR_3_WALL = stubWall("w1", [0, 0], [8000, 0], { thickness_mm: 200 });

/** Floor 3's plan as `version` in `state` (draft, published…), at revision 3. */
export const stubFloor3Plan = (version: number, state: string) =>
  stubPlan({ version, state, revision: 3, walls: [STUB_FLOOR_3_WALL] });

/** A desk at (2000, 1000), labelled A-01: the one the tests drag, select and label. */
export const STUB_EDITED_DESK = stubDesk("d1", [2000, 1000], { label: "A-01" });

/** `plan` with the edited desk on it. */
export const withEditedDesk = (plan: ReturnType<typeof stubFloor3Plan>) => ({
  ...plan,
  objects: [STUB_EDITED_DESK],
});

export const STUB_LOCK_FREE = { floor_id: "f3", locked: false, is_mine: false };
/** The signed-in admin holds floor 3's edit lock. */
export const STUB_LOCK_MINE = { ...STUB_LOCK_FREE, locked: true, is_mine: true };
/** Dana Levi holds floor 3's edit lock. */
export const STUB_LOCK_DANA = {
  floor_id: "f3",
  locked: true,
  is_mine: false,
  holder_name: "Dana Levi",
  acquired_at: "2026-10-15T06:12:00Z",
};

/** Floor 3 has no draft open. */
export const STUB_NO_DRAFT = stubProblem(404, "no-draft");

/** The server's answer to a saved changeset: draft 3 at `revision`. */
export const stubSaved = (revision: number) => ({
  floor_id: "f3",
  version: 3,
  revision,
  cascaded: [],
});

/**
 * Everything the editor reads to open floor 3 (published as `publishedVersion`, draft 3 open, the
 * lock free for the signed-in admin), with `over` replacing any route.
 */
export function stubEditorRoutes(over: Routes = {}, publishedVersion: number | null = 2): Routes {
  return {
    ...stubLocationRoutes(publishedVersion),
    "GET /api/v1/zone-types": { status: 200, body: page(STUB_ZONE_TYPES) },
    "GET /api/v1/catalog-items": { status: 200, body: page([stubCatalogItemOut(STUB_DESK_ITEM)]) },
    "POST /api/v1/floors/f3/lock": { status: 200, body: STUB_LOCK_MINE },
    "GET /api/v1/floors/f3/lock": { status: 200, body: STUB_LOCK_FREE },
    "DELETE /api/v1/floors/f3/lock": { status: 204 },
    "GET /api/v1/floors/f3/draft": { status: 200, body: stubFloor3Plan(3, "draft") },
    "GET /api/v1/floors/f3/versions/2": { status: 200, body: stubFloor3Plan(2, "published") },
    "GET /api/v1/seats": { status: 200, body: page([]) },
    ...over,
  };
}

/**
 * Editor routes whose draft has the edited desk, and which accept every changeset, recording it
 * in `changesets` (a spy): the revision goes up by one each time.
 */
export function spyChangesets() {
  const changesets: { base_revision: number; ops: { data?: unknown }[] }[] = [];
  let revision = 3;
  const routes = stubEditorRoutes({
    "GET /api/v1/floors/f3/draft": {
      status: 200,
      body: withEditedDesk(stubFloor3Plan(3, "draft")),
    },
    "POST /api/v1/floors/f3/draft/changesets": (request) => {
      void request.json().then((b) => changesets.push(b as never));
      return { status: 200, body: stubSaved(++revision) };
    },
  });
  return { routes, changesets };
}

/** How many of the spied requests were `key`, e.g. "DELETE /api/v1/floors/f3/lock". */
export const countCalls = (requests: Request[], key: string) =>
  requests.filter((r) => `${r.method} ${new URL(r.url).pathname}` === key).length;
