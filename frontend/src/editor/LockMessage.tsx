/** Why editing isn't possible right now, and what to do about it (docs/0016, docs/0089). */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useLockedByText } from "@/floors/EditFloorButton";

import type { LockState } from "./session/lock";

export function LockMessage({
  state,
  onRetry,
  onTakeOver,
}: {
  state: LockState;
  onRetry: () => void;
  onTakeOver: () => void;
}) {
  const { t } = useTranslation();
  const lockedBy = useLockedByText();
  const banner = (role: "status" | "alert", text: string, action?: ReactNode) => (
    <div
      role={role}
      className="flex items-center justify-between gap-4 border-b bg-muted px-4 py-3 text-sm"
    >
      <span>{text}</span>
      {action}
    </div>
  );
  switch (state.kind) {
    case "acquiring":
      return banner("status", t("editor.acquiring"));
    case "busy":
      return banner(
        "alert",
        lockedBy(state.holder, state.since),
        <Button size="sm" variant="outline" title={t("editor.takeOverHint")} onClick={onTakeOver}>
          {t("editor.takeOver")}
        </Button>,
      );
    case "lost":
      return banner(
        "alert",
        t("editor.lost"),
        <Button size="sm" onClick={onRetry}>
          {t("editor.retry")}
        </Button>,
      );
    case "forbidden":
      return banner("alert", t("editor.forbidden"));
    case "failed":
      return banner(
        "alert",
        t("editor.failed"),
        <Button size="sm" variant="outline" onClick={onRetry}>
          {t("editor.retry")}
        </Button>,
      );
    case "held":
      return null;
  }
}
