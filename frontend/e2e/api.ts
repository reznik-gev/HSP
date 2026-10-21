/** HSP's API, for browser tests that set up their own data. */
import { expect, type Page } from "@playwright/test";

const API = "/api/v1";

export interface Created {
  id: string;
}

/** JSON API calls with the signed-in session and its CSRF token (docs/0038). */
export async function apiAs(page: Page) {
  const me = (await (await page.request.get(`${API}/auth/me`)).json()) as { csrf_token: string };
  const headers = { "X-CSRF-Token": me.csrf_token };
  return {
    get: async <T>(path: string) => (await (await page.request.get(API + path)).json()) as T,
    post: async <T = Created>(path: string, data?: unknown) => {
      const r = await page.request.post(API + path, { data, headers });
      expect(r.ok(), `POST ${path}: ${await r.text()}`).toBeTruthy();
      return (await r.json()) as T;
    },
    put: async (path: string, data: unknown) => {
      const r = await page.request.put(API + path, { data, headers });
      expect(r.ok(), `PUT ${path}: ${await r.text()}`).toBeTruthy();
    },
    delete: async (path: string) => page.request.delete(API + path, { headers }),
  };
}

export type Api = Awaited<ReturnType<typeof apiAs>>;

/** The names a seeded floor gets: its place, the seat's label and who sits there. */
export interface SeatedPerson {
  site: string;
  building: string;
  /** The building's code, unique in the tenant. */
  code: string;
  floor: string;
  seat: string;
  person: string;
  email: string;
}

/**
 * A published floor with a wall and one assigned desk, and a person sitting at it, made through
 * the API as an admin would. Returns the ids a test needs to find and clean them up.
 */
export async function seedSeatedPerson(api: Api, s: SeatedPerson) {
  const catalog = await api.get<{
    items: { key: string; current_revision: { id: string } }[];
  }>("/catalog-items?limit=200");
  const deskRev = catalog.items.find((i) => i.key === "desk_1600x800")?.current_revision.id;
  const site = await api.post("/sites", { name: s.site, time_zone: "UTC" });
  const building = await api.post("/buildings", {
    site_id: site.id,
    name: s.building,
    code: s.code,
  });
  const floor = await api.post("/floors", {
    building_id: building.id,
    name: s.floor,
    level_index: 0,
  });
  const deskId = crypto.randomUUID();
  await api.post(`/floors/${floor.id}/lock`);
  await api.post(`/floors/${floor.id}/draft/changesets`, {
    base_revision: 0,
    ops: [
      {
        op: "add",
        kind: "wall",
        id: crypto.randomUUID(),
        data: { a: [0, 0], b: [8000, 0], thickness_mm: 200, height_mm: 3000 },
      },
      {
        op: "add",
        kind: "object",
        id: deskId,
        data: {
          catalog_item_rev_id: deskRev,
          position: [2000, 2000, 0],
          allocation_mode: "assigned",
          label: s.seat,
        },
      },
    ],
  });
  await api.post(`/floors/${floor.id}/draft/publish`, { base_revision: 1 });
  await api.delete(`/floors/${floor.id}/lock`);
  const person = await api.post("/people", { display_name: s.person, email: s.email });
  await api.put(`/seats/${deskId}/assignment`, { person_id: person.id });
  return { siteId: site.id, floorId: floor.id, deskId, personId: person.id };
}
