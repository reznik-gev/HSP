/** HSP's API, for browser tests that set up their own data. */
import { expect, type Page } from "@playwright/test";

const API = "/api/v1";

export interface Created {
  id: string;
}

/** JSON API calls with the signed-in session and its CSRF token (docs/0038). */
export async function apiAs(page: Page) {
  const me = (await (await page.request.get(`${API}/auth/me`)).json()) as { csrf_token: string };
  const headers = { "X-CSRF-Token": me.csrf_token };
  return {
    get: async <T>(path: string) => (await (await page.request.get(API + path)).json()) as T,
    post: async <T = Created>(path: string, data?: unknown) => {
      const r = await page.request.post(API + path, { data, headers });
      expect(r.ok(), `POST ${path}: ${await r.text()}`).toBeTruthy();
      return (await r.json()) as T;
    },
    put: async (path: string, data: unknown) => {
      const r = await page.request.put(API + path, { data, headers });
      expect(r.ok(), `PUT ${path}: ${await r.text()}`).toBeTruthy();
    },
    delete: async (path: string) => page.request.delete(API + path, { headers }),
  };
}
