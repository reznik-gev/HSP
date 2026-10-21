/**
 * "Where does X sit?" end to end (docs/0087 phase 1): sign in through Keycloak, search from the
 * top bar, open the seat on the floor plan. The test creates its own floor, desk and person
 * through the API and archives them afterwards (archiving frees the seat, docs/0086).
 */
import { expect, test } from "@playwright/test";

import { apiAs, seedSeatedPerson } from "./api";
import { signIn } from "./session";

const tag = Math.random().toString(36).slice(2, 7);

/** Dana, at desk E2E-<tag> on a new floor; the tag keeps parallel runs apart. */
const SEATED = {
  site: `E2E ${tag}`,
  building: "E2E building",
  code: `E${tag}`,
  floor: "E2E floor",
  seat: `E2E-${tag}`,
  person: `Dana ${tag}`,
  email: `dana.${tag}@e2e.example`,
};

test("find where someone sits and open the seat on the plan", async ({ page }) => {
  await signIn(page, "admin");
  const api = await apiAs(page);

  // A published floor with one desk, and a person sitting at it.
  const { siteId, floorId, deskId, personId } = await seedSeatedPerson(api, SEATED);

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
    await expect(page).toHaveURL(new RegExp(`/floors/${floorId}\\?seat=${deskId}`));
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
    // Zoomed out, the box's padding is under a pixel, and the glyphs the browser draws can reach
    // a fraction of a pixel past the text's measured box. Nobody sees that; a box that misses
    // the text by more than a pixel is the bug this catches.
    const PX = 1;
    if (text && backing) {
      expect(backing.x).toBeLessThanOrEqual(text.x + PX);
      expect(backing.y).toBeLessThanOrEqual(text.y + PX);
      expect(backing.x + backing.width).toBeGreaterThanOrEqual(text.x + text.width - PX);
      expect(backing.y + backing.height).toBeGreaterThanOrEqual(text.y + text.height - PX);
    }
  } finally {
    // Archiving the site archives the floor and frees the seat (docs/0086).
    await api.delete(`/sites/${siteId}`);
    await api.delete(`/people/${personId}`);
  }
});
