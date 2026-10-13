/** Whether the sidebar is collapsed to icons; remembered in this browser (docs/0087). */
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

export const useSidebar = create<SidebarState>()(
  persist(
    (set) => ({ collapsed: false, toggle: () => set((s) => ({ collapsed: !s.collapsed })) }),
    {
      name: "hsp.sidebar",
    },
  ),
);
