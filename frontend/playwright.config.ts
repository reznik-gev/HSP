/**
 * Browser tests against the running dev stack (docs/0087 choice 8): `pnpm dev`, the API on
 * :8000 and Keycloak from deploy/compose.dev.yml must be up. Not part of PR CI, which has no
 * Keycloak. The release workflow runs them against the installed bundle (docs/0102).
 *
 *   pnpm e2e                      # bundled Chromium (run `pnpm exec playwright install` once)
 *   PW_CHANNEL=msedge pnpm e2e    # or an installed browser: msedge, chrome
 *   HSP_E2E_URL=https://localhost:8443 HSP_E2E_IGNORE_HTTPS_ERRORS=1 pnpm e2e
 *                                 # a stack from deploy/test-bundle.sh (self-signed certificate)
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
    ignoreHTTPSErrors: process.env.HSP_E2E_IGNORE_HTTPS_ERRORS === "1",
    viewport: { width: 1400, height: 860 },
    trace: "retain-on-failure",
  },
});
