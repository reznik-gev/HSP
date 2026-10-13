/** Code-based route tree (docs/0067). Pages live inside the app shell (docs/0087). */
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/app/AppShell";
import { EmptyState, Page } from "@/app/Page";

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFound });

/** Every page except the dev-only benchmark sits inside the sidebar + top bar. */
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  beforeLoad: () => redirect({ to: "/floors", throw: true }),
});

function FloorsPage() {
  const { t } = useTranslation();
  return (
    <Page title={t("floors.title")}>
      <EmptyState>{t("floors.empty")}</EmptyState>
    </Page>
  );
}

function SeatsPage() {
  const { t } = useTranslation();
  return (
    <Page title={t("seats.title")}>
      <EmptyState>{t("seats.empty")}</EmptyState>
    </Page>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <Page title={t("notFound.title")}>
      <p className="max-w-prose text-muted-foreground">{t("notFound.body")}</p>
    </Page>
  );
}

const floorsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/floors",
  component: FloorsPage,
});
const seatsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/seats",
  component: SeatsPage,
});

// Dev-only benchmark routes (docs/0073): present in `pnpm dev` and `vite build --mode bench`,
// tree-shaken out of production builds because the condition is a build-time constant.
const benchRoutes =
  import.meta.env.DEV || import.meta.env.VITE_BENCH === "1"
    ? [
        createRoute({
          getParentRoute: () => rootRoute,
          path: "/bench/svg",
          component: lazyRouteComponent(() => import("./bench/SvgBench"), "SvgBench"),
        }),
      ]
    : [];

export const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([indexRoute, floorsRoute, seatsRoute]),
  ...benchRoutes,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
