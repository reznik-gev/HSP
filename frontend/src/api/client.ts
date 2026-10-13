/**
 * Typed API client (docs/0039). Types are generated from backend/openapi.json:
 *   pnpm api:types
 */
import createClient, { type Middleware } from "openapi-fetch";

import { useSessionExpired } from "@/auth/expiry";

import type { paths } from "./schema";

let csrfToken: string | null = null;

/** Set from /api/v1/auth/me (docs/0038); sent on every state-changing request. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

const csrf: Middleware = {
  onRequest({ request }) {
    if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      request.headers.set("X-CSRF-Token", csrfToken);
    }
    return request;
  },
};

/** A 401 from anything but /auth/me means the session ended while the app was open. */
const expiry: Middleware = {
  onResponse({ request, response }) {
    if (response.status === 401 && !new URL(request.url).pathname.endsWith("/auth/me")) {
      useSessionExpired.setState({ expired: true });
    }
    return response;
  },
};

// Same origin as the page; the session cookie is sent automatically (docs/0038). The base URL
// is absolute because Node's Request (used by tests) rejects relative ones. `fetch` is looked up
// per call so tests can replace it.
export const api = createClient<paths>({
  baseUrl: globalThis.location?.origin ?? "http://localhost",
  credentials: "same-origin",
  fetch: (request) => globalThis.fetch(request),
});
api.use(csrf, expiry);
