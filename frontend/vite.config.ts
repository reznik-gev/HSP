import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In development the browser talks to Vite only; /api and /auth are proxied so that
// frontend, API and Keycloak share one origin, as nginx does in production (docs/0038, 0060).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    // `vite build --mode bench` includes the /bench routes (docs/0073).
    "import.meta.env.VITE_BENCH": JSON.stringify(mode === "bench" ? "1" : ""),
  },
  build: {
    ...(mode === "bench" ? { outDir: "dist-bench" } : {}),
    // The main chunk is library code (React, Radix, TanStack, i18next): ~180 kB gzipped, fine
    // for a desktop app on the company network (docs/0087). Pages load lazily on top of it;
    // raise this only with a reason.
    chunkSizeWarningLimit: 700,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/auth": "http://localhost:8080",
      "/healthz": "http://localhost:8000", // dev-only smoke check on the home page
    },
  },
  test: {
    // The editor core is headless (docs/0052), so its tests run without a DOM. Screen tests
    // (*.test.tsx) opt into jsdom with a `// @vitest-environment jsdom` comment.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    // Screen tests render the whole app; with every file running in parallel a slow machine
    // can need more than the default 5 s for one test.
    testTimeout: 15_000,
  },
}));
