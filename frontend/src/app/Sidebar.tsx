import { Link } from "@tanstack/react-router";
import {
  Armchair,
  FileUp,
  Layers,
  Network,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useIsAdmin } from "@/auth/admin";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useSidebar } from "./sidebarState";

/** Main areas (docs/0087, docs/0088). Later phases add Catalog and Imports. */
const AREAS: {
  to: "/floors" | "/seats" | "/people" | "/org" | "/imports";
  label: "nav.floors" | "nav.seats" | "nav.people" | "nav.org" | "nav.imports";
  icon: LucideIcon;
  /** Hidden from viewers (docs/0088 choice 2). */
  adminOnly?: boolean;
}[] = [
  { to: "/floors", label: "nav.floors", icon: Layers },
  { to: "/seats", label: "nav.seats", icon: Armchair },
  { to: "/people", label: "nav.people", icon: Users },
  { to: "/org", label: "nav.org", icon: Network },
  { to: "/imports", label: "nav.imports", icon: FileUp, adminOnly: true },
];

export function Sidebar() {
  const { t } = useTranslation();
  const { collapsed, toggle } = useSidebar();
  const isAdmin = useIsAdmin();
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-e bg-card transition-[width] duration-150",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className="flex h-12 items-center gap-2.5 border-b px-[18px]">
        <Mark />
        {!collapsed && (
          <span
            className="truncate text-[15px] font-semibold tracking-tight"
            title={t("app.fullName")}
          >
            {t("app.name")}
          </span>
        )}
      </div>
      <nav aria-label={t("nav.main")} className="flex flex-1 flex-col gap-0.5 p-2">
        {AREAS.filter((a) => isAdmin || !a.adminOnly).map(({ to, label, icon: Icon }) => {
          const link = (
            <Link
              to={to}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-2.5 text-muted-foreground",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                "aria-[current=page]:bg-accent aria-[current=page]:font-medium",
                "aria-[current=page]:text-accent-foreground",
              )}
            >
              <Icon className="size-[18px] shrink-0" aria-hidden />
              <span className={cn(collapsed && "sr-only")}>{t(label)}</span>
            </Link>
          );
          return collapsed ? (
            <Tooltip key={to}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{t(label)}</TooltipContent>
            </Tooltip>
          ) : (
            <div key={to}>{link}</div>
          );
        })}
      </nav>
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={t(collapsed ? "nav.expand" : "nav.collapse")}
          aria-expanded={!collapsed}
          className="text-muted-foreground"
        >
          <ToggleIcon className="rtl:-scale-x-100" aria-hidden />
        </Button>
      </div>
    </aside>
  );
}

/** The HSP mark: the corner of a floor plan with a seat in it, drawn in the accent. */
function Mark() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-primary" aria-hidden>
      <path d="M3 17V3h14" fill="none" stroke="currentColor" strokeWidth="2.25" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
    </svg>
  );
}
