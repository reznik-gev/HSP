import { Outlet } from "@tanstack/react-router";

import { SessionGate } from "@/auth/SessionGate";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/lib/notify";

/**
 * For signed-in pages that need the whole window, like the floor editor (docs/0089 choice 2):
 * the same session handling and notices as the app shell, without the sidebar and top bar.
 */
export function FullScreenShell() {
  return (
    <SessionGate>
      <TooltipProvider delayDuration={300}>
        <div className="flex h-screen min-w-[1024px] flex-col overflow-hidden">
          <Outlet />
        </div>
        <Toaster />
      </TooltipProvider>
    </SessionGate>
  );
}
