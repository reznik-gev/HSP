/** Signing in for the browser tests: through Keycloak's own page, as a user would. */
import type { Page } from "@playwright/test";

/** Sign in as a test user whose password is their username (admin, viewer). */
export async function signIn(page: Page, user: string) {
  await page.goto("/floors");
  await page.waitForURL(/\/realms\/hsp\//);
  await page.fill("#username", user);
  await page.fill("#password", user);
  await page.click("#kc-login");
  await page.waitForURL(/\/floors$/);
}
