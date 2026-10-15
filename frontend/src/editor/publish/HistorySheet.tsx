/**
 * The floor's versions (docs/0015, docs/0082), newest first, in a side sheet. An older version
 * can be restored as a new draft, to check and publish like any other; the server only allows
 * that while there is no draft, so Restore waits until the draft is published or discarded.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { ApiProblem, asProblem, problemMessage } from "@/api/problems";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notifyError } from "@/lib/notify";

export function HistorySheet({
  floorId,
  hasDraft,
  open,
  onClose,
  onRestored,
}: {
  floorId: string;
  hasDraft: boolean;
  open: boolean;
  onClose: () => void;
  onRestored: (version: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const versions = useQuery({
    queryKey: ["floor-versions", floorId],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/floors/{floor_id}/versions", {
        params: { path: { floor_id: floorId } },
      });
      if (!data) throw new Error("Couldn't load the versions");
      return [...data.items].reverse();
    },
    enabled: open,
    gcTime: 0,
  });
  const restore = useMutation({
    mutationFn: async (version: number) => {
      const { error } = await api.POST("/api/v1/floors/{floor_id}/draft/restore/{version}", {
        params: { path: { floor_id: floorId, version } },
      });
      if (error) throw new ApiProblem(asProblem(error));
      return version;
    },
    onSuccess: onRestored,
    onError: (e) => notifyError(problemMessage(asProblem(e), t("common.failed"))),
  });
  const when = (iso: string | null | undefined) =>
    iso
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(iso))
      : null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("editor.history.title")}</SheetTitle>
          <SheetDescription>
            {hasDraft ? t("editor.history.draftFirst") : t("editor.history.explain")}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {versions.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("editor.history.loadFailed")}
            </p>
          )}
          <ol className="space-y-3">
            {versions.data?.map((v) => (
              <li key={v.version} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">
                    {t("editor.history.version", { version: v.version })}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      · {t(`editor.history.states.${v.state}`)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {when(v.published_at ?? v.created_at)}
                  </p>
                  {v.note && <p className="mt-0.5">{v.note}</p>}
                </div>
                {v.state === "superseded" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={hasDraft || restore.isPending}
                    onClick={() => restore.mutate(v.version)}
                  >
                    {t("editor.history.restore")}
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
