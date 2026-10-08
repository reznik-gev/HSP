import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In development the browser talks to Vite only; /api and /auth are proxied so that
// frontend, API and Keycloak share one origin, as nginx does in production (docs/0038, 0060).
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    // The editor core is headless (docs/0052), so most tests run without a DOM.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
