/**
 * After the restore (docs/0106): the admin signs in, which works only if Keycloak's database came
 * back too, and finds the seeded person's seat from the top bar.
 */
import { expect, test } from "@playwright/test";

import { signIn } from "../session";
import { DRILL } from "./data";

test("sign in and find the seeded seat", async ({ page }) => {
  await signIn(page, "admin");
  await page.getByRole("searchbox", { name: "Search seats, people and teams" }).fill(DRILL.person);
  await page.keyboard.press("Enter");
  const row = page.getByRole("row", { name: new RegExp(DRILL.seat) });
  await expect(row).toContainText(DRILL.person);
  await expect(row).toContainText(`${DRILL.site}›${DRILL.building}›${DRILL.floor}`);
});
