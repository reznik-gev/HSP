/**
 * Browser tests against the running dev stack (docs/0087 choice 8): `pnpm dev`, the API on
 * :8000 and Keycloak from deploy/compose.dev.yml must be up. Not part of CI, which has no
 * Keycloak.
 *
 *   pnpm e2e                      # bundled Chromium (run `pnpm exec playwright install` once)
 *   PW_CHANNEL=msedge pnpm e2e    # or an installed browser: msedge, chrome
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.HSP_E2E_URL ?? "http://localhost:5173",
    channel: process.env.PW_CHANNEL,
    viewport: { width: 1400, height: 860 },
    trace: "retain-on-failure",
  },
});
