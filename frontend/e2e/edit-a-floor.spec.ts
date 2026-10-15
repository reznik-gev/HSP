/**
 * Drawing a floor end to end (docs/0089 phase 3a): sign in, open a new floor in the editor,
 * draw a room, place a desk, label it and publish; the floor page then shows the seat. The
 * test creates its own site, building and floor through the API and archives them afterwards.
 */
import { expect, type Page, test } from "@playwright/test";

const tag = Math.random().toString(36).slice(2, 7);
const API = "/api/v1";

async function signIn(page: Page, user: string) {
  await page.goto("/floors");
  await page.waitForURL(/\/realms\/hsp\//);
  await page.fill("#username", user);
  await page.fill("#password", user);
  await page.click("#kc-login");
  await page.waitForURL(/\/floors$/);
}

/** Screen position of a plan point (mm, +y north), read from the plan's viewBox. */
async function planPoint(page: Page) {
  const svg = page.locator("svg[data-lod]");
  const box = (await svg.boundingBox())!;
  const [vx, vy, vw, vh] = (await svg.getAttribute("viewBox"))!.split(" ").map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return (x: number, y: number) =>
    [box.x + ((x - vx) / vw) * box.width, box.y + ((-y - vy) / vh) * box.height] as const;
}

test("draw a room, place and label a desk, publish", async ({ page }) => {
  await signIn(page, "admin");
  const me = (await (await page.request.get(`${API}/auth/me`)).json()) as { csrf_token: string };
  const headers = { "X-CSRF-Token": me.csrf_token };
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post(API + path, { data, headers });
    expect(r.ok(), `POST ${path}: ${await r.text()}`).toBeTruthy();
    return (await r.json()) as { id: string };
  };
  const site = await post("/sites", { name: `E2E edit ${tag}`, time_zone: "UTC" });
  const building = await post("/buildings", {
    site_id: site.id,
    name: "E2E building",
    code: `D${tag}`,
  });
  const floor = await post("/floors", {
    building_id: building.id,
    name: "E2E floor",
    level_index: 0,
  });

  try {
    await page.goto(`/floors/${floor.id}`);
    await page.getByRole("link", { name: "Edit floor" }).click();
    await expect(page.getByRole("heading", { name: "Editing E2E floor" })).toBeVisible();
    await expect(page.getByText("Not published yet")).toBeVisible();

    // A 8 × 6 m room, corner by corner; the last click closes it.
    const at = await planPoint(page);
    await page.keyboard.press("w");
    for (const [x, y] of [
      [-4000, -3000],
      [4000, -3000],
      [4000, 3000],
      [-4000, 3000],
      [-4000, -3000],
    ] as const) {
      await page.mouse.click(...at(x, y));
    }
    await expect(page.getByText("Draft 1 · Saved")).toBeVisible();

    // A desk in the middle of the room.
    await page.keyboard.press("p");
    await page.getByRole("button", { name: /Desk 160 x 80/ }).click();
    const place = await planPoint(page); // the catalog panel narrowed the canvas
    await page.mouse.click(...place(0, 0));
    await page.keyboard.press("v");
    const select = await planPoint(page);
    await page.mouse.click(...select(0, 0));
    // A seat without a label is a warning until it gets one (docs/0092).
    await expect(page.getByRole("tab", { name: /Problems\s*1/ })).toBeVisible();
    await page.getByLabel("Seat label").fill(`E2E-${tag}`);
    await page.getByLabel("Seat label").press("Enter");
    await expect(page.getByText("Draft 1 · Saved")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Problems" })).toBeVisible();

    // Publish: everything is new.
    await page.getByRole("button", { name: "Publish" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Publish E2E floor" });
    await expect(dialog.getByText("Added: 4 walls, 1 item")).toBeVisible();
    await dialog.getByRole("button", { name: "Publish" }).click();

    // Back on the floor page, with the new seat.
    await expect(page.getByRole("heading", { name: "E2E floor" })).toBeVisible();
    await expect(page.getByText("Published version 1")).toBeVisible();
    await expect(page.locator("svg[data-lod] text", { hasText: `E2E-${tag}` })).toBeVisible();
  } finally {
    await page.request.delete(`${API}/sites/${site.id}`, { headers });
  }
});
