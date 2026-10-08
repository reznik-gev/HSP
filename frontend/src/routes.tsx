/** Code-based route tree (docs/0067). */
import { useQuery } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Link, Outlet } from "@tanstack/react-router";

import { api } from "@/api/client";

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen">
      <header className="flex items-center gap-6 border-b border-border px-6 py-3">
        <Link to="/" className="font-semibold">
          HSM
        </Link>
        <span className="text-sm text-muted-foreground">Human-Space Management</span>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  ),
});

function Home() {
  // /healthz is proxied in dev only for this smoke check; real screens use /api/v1.
  const health = useQuery({
    queryKey: ["healthz"],
    queryFn: async () => {
      const { data, error } = await api.GET("/healthz");
      if (error) throw new Error("API unreachable");
      return data;
    },
  });

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Welcome to HSM</h1>
      <p className="text-muted-foreground">
        API:{" "}
        {health.isPending
          ? "checking..."
          : health.isError
            ? "unreachable"
            : `${health.data.status} (v${health.data.version})`}
      </p>
    </section>
  );
}

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });

export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
