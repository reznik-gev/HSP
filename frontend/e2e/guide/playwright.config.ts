/**
 * Records the user guide's GIFs (docs/0146) from the Northwind demo (docs/demos/northwind-robotics.md).
 * Kept apart from `pnpm e2e`: *.guide.ts files only run with this config. `pnpm guide:gifs` runs
 * it, then turns each video into a GIF in src/guide/media/.
 *
 * The demo must be up and freshly seeded. The recording leaves it as it found it: the drawing on
 * Floor 5 is discarded, nothing is published, and the seat it assigns is unassigned again.
 */
import { defineConfig } from "@playwright/test";

import base from "../../playwright.config";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "*.guide.ts",
  outputDir: "../../test-results/guide",
  workers: 1,
  timeout: 120_000,
});
