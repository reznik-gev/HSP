/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" in `vite build --mode bench` (docs/0073). */
  readonly VITE_BENCH?: string;
  /** The release, e.g. "1.0.0"; "0.0.0-dev" outside a release build (docs/0104). */
  readonly VITE_HSP_VERSION: string;
}
