import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/** "HSP 1.0.0": the release of HSP in use, muted (docs/0104). Shown in the user menu and at the
 * bottom of the sidebar. Outside a release build it reads "HSP 0.0.0-dev". */
export function Version({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn("text-xs text-muted-foreground", className)}>
      {t("app.version", { version: import.meta.env.VITE_HSP_VERSION })}
    </span>
  );
}
