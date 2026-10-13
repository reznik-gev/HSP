/** Set when an API call answers 401 mid-session: the session ended (docs/0038, docs/0087). */
import { create } from "zustand";

export const useSessionExpired = create<{ expired: boolean }>(() => ({ expired: false }));
