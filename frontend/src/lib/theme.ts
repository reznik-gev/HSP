/**
 * Light / dark / same-as-system (docs/0087). Kept in this browser for now; the per-user
 * preferences API (docs/0087, phase 1 step 3) will save it on the server.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeChoice = "light" | "dark" | "system";

interface ThemeState {
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

export const useTheme = create<ThemeState>()(
  persist((set) => ({ choice: "system", setChoice: (choice) => set({ choice }) }), {
    name: "hsp.theme",
  }),
);

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

export function applyTheme(choice: ThemeChoice): void {
  const dark = choice === "dark" || (choice === "system" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
}

/** Keep <html class="dark"> in step with the choice and, for "system", with the OS setting. */
export function startThemeSync(): void {
  applyTheme(useTheme.getState().choice);
  useTheme.subscribe((s) => applyTheme(s.choice));
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => applyTheme(useTheme.getState().choice));
}
