/**
 * "Where does X sit?" end to end (docs/0087 phase 1): sign in through Keycloak, search from the
 * top bar, open the seat on the floor plan. The test creates its own floor, desk and person
 * through the API and archives them afterwards (archiving frees the seat, docs/0086).
 */
import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./session";

const tag = Math.random().toString(36).slice(2, 7);
const API = "/api/v1";

interface Created {
  id: string;
}

/** JSON API calls with the signed-in session and its CSRF token (docs/0038). */
async function apiAs(page: Page) {
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

test("find where someone sits and open the seat on the plan", async ({ page }) => {
  await signIn(page, "admin");
  const api = await apiAs(page);

  // A published floor with one desk, and a person sitting at it.
  const catalog = await api.get<{
    items: { key: string; current_revision: { id: string } }[];
  }>("/catalog-items?limit=200");
  const deskRev = catalog.items.find((i) => i.key === "desk_1600x800")?.current_revision.id;
  const site = await api.post("/sites", { name: `E2E ${tag}`, time_zone: "UTC" });
  const building = await api.post("/buildings", {
    site_id: site.id,
    name: "E2E building",
    code: `E${tag}`,
  });
  const floor = await api.post("/floors", {
    building_id: building.id,
    name: "E2E floor",
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
          label: `E2E-${tag}`,
        },
      },
    ],
  });
  await api.post(`/floors/${floor.id}/draft/publish`, { base_revision: 1 });
  await api.delete(`/floors/${floor.id}/lock`);
  const person = await api.post("/people", {
    display_name: `Dana ${tag}`,
    email: `dana.${tag}@e2e.example`,
  });
  await api.put(`/seats/${deskId}/assignment`, { person_id: person.id });

  try {
    // Search from the top bar.
    await page
      .getByRole("searchbox", { name: "Search seats, people and teams" })
      .fill(`Dana ${tag}`);
    await page.keyboard.press("Enter");
    const row = page.getByRole("row", { name: new RegExp(`E2E-${tag}`) });
    await expect(row).toContainText(`Dana ${tag}`);
    await expect(row).toContainText(`E2E ${tag}›E2E building›E2E floor`);

    // Open it on the plan: the seat is selected and its panel names the holder.
    await row.getByRole("link", { name: `Show E2E-${tag} on the floor plan` }).click();
    await expect(page).toHaveURL(new RegExp(`/floors/${floor.id}\\?seat=${deskId}`));
    const panel = page.getByRole("complementary", { name: "Seat details" });
    await expect(panel).toContainText(`E2E-${tag}`);
    await expect(panel).toContainText(`Dana ${tag}`);
    await expect(page.getByRole("heading", { name: "E2E floor" })).toBeVisible();

    // The seat's label sits on a box that covers its text, so a monitor under it can't show
    // through as a strike-through. Measured here because only a browser lays text out.
    const label = page.locator(`#l-${deskId}`);
    const text = await label.locator("text").boundingBox();
    const backing = await label.locator("rect.plan-label-backing").boundingBox();
    expect(text && backing).toBeTruthy();
    if (text && backing) {
      expect(backing.x).toBeLessThan(text.x);
      expect(backing.y).toBeLessThan(text.y);
      expect(backing.x + backing.width).toBeGreaterThan(text.x + text.width);
      expect(backing.y + backing.height).toBeGreaterThan(text.y + text.height);
    }
  } finally {
    // Archiving the site archives the floor and frees the seat (docs/0086).
    await api.delete(`/sites/${site.id}`);
    await api.delete(`/people/${person.id}`);
  }
});
