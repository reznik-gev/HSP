/**
 * Records the user guide's GIFs (docs/0146) from the Northwind demo (docs/demos/northwind-robotics.md).
 * Kept apart from `pnpm e2e`: *.guide.ts files only run with this config. `pnpm guide:gifs` runs
 * it, then turns each recording's frames into a GIF in src/guide/media/<lang>/.
 *
 * The demo must be up, freshly seeded, and running as the version about to be released, so the
 * sidebar shows it: `MUSICAL_CHAIRS_VERSION=X.Y.Z uv run python ../deploy/demo/demo.py switch
 * --main`, from backend/ (docs/0147, docs/guides/releasing.md). The recording puts back what it
 * changes: the drawing on Floor 5 is discarded (a discarded draft stays in its history), nothing is
 * published, the seat it reserves is given back, and the demo user's preferences are restored.
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
