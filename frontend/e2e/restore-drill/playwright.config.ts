/**
 * The weekly restore test's two browser steps (docs/0106), run by deploy/test-restore.sh against
 * an installed bundle. Kept apart from `pnpm e2e`: *.drill.ts files only run with this config.
 *
 *   pnpm exec playwright test -c e2e/restore-drill/playwright.config.ts seed
 */
import { defineConfig } from "@playwright/test";

import base from "../../playwright.config";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "*.drill.ts",
});
