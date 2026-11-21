import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/** "Musical Chairs 1.0.0": the release of Musical Chairs in use, muted (docs/0104). Shown in the user menu and at the
 * bottom of the sidebar. Outside a release build it reads "Musical Chairs 0.0.0-dev". */
export function Version({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn("text-xs text-muted-foreground", className)}>
      {t("app.version", { version: import.meta.env.VITE_MUSICAL_CHAIRS_VERSION })}
    </span>
  );
}
