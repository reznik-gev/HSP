import { Outlet } from "@tanstack/react-router";

import { TooltipProvider } from "@/components/ui/tooltip";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** Sidebar + top bar around every page (docs/0087). Mirrors automatically in Hebrew. */
export function AppShell() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen min-w-[1024px] overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="min-h-0 flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
