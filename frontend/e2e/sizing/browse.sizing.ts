/**
 * The sizing bench's load (deploy/measure-size.sh): someone looking people up in the seeded
 * office, as the busiest use of HSP. Each round searches for a random person from the top bar and
 * opens their seat on its 500-desk floor. Run several at once, with --workers and --repeat-each.
 */
import { expect, test } from "@playwright/test";

import { signIn } from "../session";
import { PEOPLE, seatOf } from "./office";

const ROUNDS = 10;

test("look people up and open their seats", async ({ page }) => {
  await signIn(page, "viewer");
  for (let round = 0; round < ROUNDS; round++) {
    const seat = seatOf(1 + Math.floor(Math.random() * PEOPLE));
    await page.getByRole("searchbox", { name: "Search seats, people and teams" }).fill(seat.email);
    await page.keyboard.press("Enter");
    const row = page.getByRole("row", { name: new RegExp(`\\b${seat.label}\\b`) });
    await expect(row).toContainText(seat.person);
    await row.getByRole("link", { name: `Show ${seat.label} on the floor plan` }).click();
    const panel = page.getByRole("complementary", { name: "Seat details" });
    await expect(panel).toContainText(seat.person);
    await expect(page.getByRole("heading", { name: seat.floor })).toBeVisible();
  }
});
