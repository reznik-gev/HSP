/**
 * Typed API client (docs/0039). Types are generated from backend/openapi.json:
 *   pnpm api:types
 */
import createClient, { type Middleware } from "openapi-fetch";

import type { paths } from "./schema";

let csrfToken: string | null = null;

/** Set from /api/v1/auth/me once the BFF auth endpoints exist (docs/0038). */
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

// Same origin as the page; the session cookie is sent automatically (docs/0038).
export const api = createClient<paths>({ baseUrl: "/", credentials: "same-origin" });
api.use(csrf);
