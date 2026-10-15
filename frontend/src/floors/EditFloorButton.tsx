/**
 * "Edit floor" on the floor page (docs/0089 choice 2). While someone else is editing, it says
 * who and since when, and offers Take over (docs/0016): their draft is kept, they stop editing.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { forceRelease, lockStatusQuery } from "@/editor/session/lock";
import { notifyError } from "@/lib/notify";

/** "Being edited by Dana since 09:12", or without the name or time when unknown. */
export function useLockedByText() {
  const { t, i18n } = useTranslation();
  return (holder: string | null, since: string | null) => {
    if (!holder) return t("editor.busyUnknown");
    const time = since
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage, { timeStyle: "short" }).format(
          new Date(since),
        )
      : null;
    return time
      ? t("editor.busy", { name: holder, time })
      : t("editor.busyNoTime", { name: holder });
  };
}

export function EditFloorButton({ floorId }: { floorId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lock = useQuery(lockStatusQuery(floorId));
  const lockedBy = useLockedByText();
  const [taking, setTaking] = useState(false);
  const busy = lock.data?.locked && !lock.data.is_mine;

  if (!busy) {
    return (
      <Button asChild size="sm">
        <Link to="/floors/$floorId/edit" params={{ floorId }}>
          <Pencil aria-hidden />
          {t("editor.edit")}
        </Link>
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground">
        {lockedBy(lock.data?.holder_name ?? null, lock.data?.acquired_at ?? null)}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={taking}
        title={t("editor.takeOverHint")}
        onClick={() => {
          setTaking(true);
          void forceRelease(floorId).then((ok) => {
            if (ok) return navigate({ to: "/floors/$floorId/edit", params: { floorId } });
            setTaking(false);
            notifyError(t("common.failed"));
          });
        }}
      >
        {t("editor.takeOver")}
      </Button>
    </div>
  );
}
