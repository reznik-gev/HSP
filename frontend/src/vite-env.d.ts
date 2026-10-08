/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" in `vite build --mode bench` (docs/0073). */
  readonly VITE_BENCH?: string;
}
