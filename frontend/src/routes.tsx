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
import { FullScreenShell } from "@/app/FullScreenShell";
import { Page } from "@/app/Page";
import { FloorsPage } from "@/floors/FloorsPage";
import { validateCatalogSearch } from "@/catalog/search";
import { validateDevicesSearch } from "@/devices/search";
import { validateOrgSearch } from "@/org/search";
import { validatePeopleSearch } from "@/people/search";
import { SeatsPage } from "@/seats/SeatsPage";

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFound });

/** Every page except the dev-only benchmark sits inside the sidebar + top bar. */
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: AppShell,
});

/** Full-window pages: signed in, but without the sidebar and top bar (docs/0089). */
const fullScreenRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "editor",
  component: FullScreenShell,
});

const indexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  beforeLoad: () => redirect({ to: "/floors", throw: true }),
});

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
const floorPlanRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/floors/$floorId",
  validateSearch: (search: Record<string, unknown>): { seat?: string } =>
    typeof search.seat === "string" ? { seat: search.seat } : {},
  // Loaded on first visit: keeps the plan viewer out of the initial bundle.
  component: lazyRouteComponent(() => import("@/floors/FloorPlanPage"), "FloorPlanPage"),
});
const editorRoute = createRoute({
  getParentRoute: () => fullScreenRoute,
  path: "/floors/$floorId/edit",
  component: lazyRouteComponent(() => import("@/editor/EditorPage"), "EditorPage"),
});
const peopleRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/people",
  validateSearch: validatePeopleSearch,
  component: lazyRouteComponent(() => import("@/people/PeoplePage"), "PeoplePage"),
});
const orgRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/org",
  validateSearch: validateOrgSearch,
  component: lazyRouteComponent(() => import("@/org/OrgPage"), "OrgPage"),
});
const importsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/imports",
  validateSearch: (s: Record<string, unknown>): { kind?: "units" | "people" | "seats" } =>
    s.kind === "units" || s.kind === "people" || s.kind === "seats" ? { kind: s.kind } : {},
  component: lazyRouteComponent(() => import("@/imports/ImportsPage"), "ImportsPage"),
});
const catalogRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/catalog",
  validateSearch: validateCatalogSearch,
  component: lazyRouteComponent(() => import("@/catalog/CatalogPage"), "CatalogPage"),
});
const devicesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/devices",
  validateSearch: validateDevicesSearch,
  component: lazyRouteComponent(() => import("@/devices/DevicesPage"), "DevicesPage"),
});
const seatsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/seats",
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q } : {},
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
  shellRoute.addChildren([
    indexRoute,
    floorsRoute,
    floorPlanRoute,
    peopleRoute,
    orgRoute,
    importsRoute,
    catalogRoute,
    devicesRoute,
    seatsRoute,
  ]),
  fullScreenRoute.addChildren([editorRoute]),
  ...benchRoutes,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
