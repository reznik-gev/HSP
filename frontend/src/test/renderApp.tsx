/**
 * Render the real app at a path, against a fake backend (docs/0087 choice 8). `routes` maps
 * "METHOD /path" to a JSON body or a status; anything else answers 404.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, render } from "@testing-library/react";
import { vi } from "vitest";

import type { Me } from "@/auth/session";
import { routeTree } from "@/routes";

export const ADMIN: Me = {
  subject: "u-1",
  name: "Noa Barak",
  email: "noa@acme.example",
  roles: ["hsp-admin"],
  is_admin: true,
  csrf_token: "csrf-123",
};

export type Reply = { status: number; body?: unknown };
export type Routes = Record<string, Reply | ((request: Request) => Reply)>;

export function fakeBackend(routes: Routes) {
  const calls: Request[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const request = input instanceof Request ? input : new Request(String(input));
    calls.push(request);
    const key = `${request.method} ${new URL(request.url).pathname}`;
    const handler = routes[key];
    const reply = typeof handler === "function" ? handler(request) : (handler ?? { status: 404 });
    return Promise.resolve(
      new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

export async function renderApp(path: string, routes: Routes = {}) {
  const backend = fakeBackend({ "GET /api/v1/auth/me": { status: 200, body: ADMIN }, ...routes });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await act(() => router.load());
  return { router, queryClient, ...backend };
}
