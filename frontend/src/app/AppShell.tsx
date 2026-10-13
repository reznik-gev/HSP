import { Outlet } from "@tanstack/react-router";

import { SessionGate } from "@/auth/SessionGate";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/lib/notify";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** Sidebar + top bar around every page, for signed-in users (docs/0087). Mirrors in Hebrew. */
export function AppShell() {
  return (
    <SessionGate>
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
        <Toaster />
      </TooltipProvider>
    </SessionGate>
  );
}
