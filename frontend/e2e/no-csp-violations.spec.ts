/**
 * The pages work under the Content Security Policy that hsp-web sends (docs/0060, docs/0098).
 * Meaningful only against hsp-web: the dev server sends no policy. The release workflow runs it
 * against the installed bundle (docs/0102).
 */
import { expect, test } from "@playwright/test";

import { signIn } from "./session";

const PAGES = ["/floors", "/people", "/teams", "/catalog", "/devices"];

test("signing in and opening each page breaks no content security rule", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content.Security.Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });

  await signIn(page, "admin");
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }

  expect(violations).toEqual([]);
});
