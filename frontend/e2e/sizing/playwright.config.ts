/**
 * The sizing bench's seed (deploy/measure-size.sh), run against an installed bundle. Kept apart
 * from `pnpm e2e`: *.sizing.ts files only run with this config.
 *
 *   HSP_SIZING_PEOPLE=5000 pnpm exec playwright test -c e2e/sizing/playwright.config.ts
 */
import { defineConfig } from "@playwright/test";

import base from "../../playwright.config";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "*.sizing.ts",
});
