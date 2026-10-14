/**
 * A team's positions. Admins add, rename and remove them; removing keeps the holders in the
 * team, without a position (docs/0084).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { ApiProblem, asProblem, problemMessage } from "@/api/problems";
import { useIsAdmin } from "@/auth/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { SheetSection } from "@/components/ui/sheet";
import { notify, notifyError } from "@/lib/notify";

import { positionsQuery } from "../units";

export function Positions({ unitId }: { unitId: string }) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const client = useQueryClient();
  const positions = useQuery(positionsQuery(unitId));
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const refresh = () => void client.invalidateQueries({ queryKey: ["positions", unitId] });
  const run = useMutation({
    mutationFn: async (action: () => Promise<{ error?: unknown }>) => {
      const { error } = await action();
      if (error) throw new ApiProblem(asProblem(error));
    },
    onSuccess: refresh,
    onError: (e) => notifyError(problemMessage(asProblem(e), t("common.failed"))),
  });
  return (
    <SheetSection title={t("org.positions")}>
      {positions.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("org.noPositions")}</p>
      )}
      <ul className="space-y-1 text-sm">
        {positions.data?.map((p) =>
          editing?.id === p.id ? (
            <li key={p.id} className="flex items-center gap-2">
              <Input
                aria-label={t("org.positionTitle")}
                value={editing.title}
                onChange={(e) => setEditing({ id: p.id, title: e.target.value })}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("common.save")}
                onClick={() => {
                  const title = editing.title.trim();
                  setEditing(null);
                  if (title && title !== p.title)
                    run.mutate(() =>
                      api.PATCH("/api/v1/positions/{position_id}", {
                        params: { path: { position_id: p.id } },
                        body: { title },
                      }),
                    );
                }}
              >
                <Check aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("common.cancel")}
                onClick={() => setEditing(null)}
              >
                <X aria-hidden />
              </Button>
            </li>
          ) : (
            <li key={p.id} className="flex h-9 items-center gap-1">
              <span className="flex-1">{p.title}</span>
              {isAdmin && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("org.renamePosition", { title: p.title })}
                    onClick={() => setEditing({ id: p.id, title: p.title })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("org.removePosition", { title: p.title })}
                    onClick={() =>
                      run.mutate(
                        () =>
                          api.DELETE("/api/v1/positions/{position_id}", {
                            params: { path: { position_id: p.id } },
                          }),
                        {
                          onSuccess: () => {
                            void client.invalidateQueries({ queryKey: ["people"] });
                            notify(t("org.positionRemoved", { title: p.title }));
                          },
                        },
                      )
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </>
              )}
            </li>
          ),
        )}
      </ul>
      {isAdmin && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const title = adding.trim();
            if (!title) return;
            setAdding("");
            run.mutate(() =>
              api.POST("/api/v1/org-units/{unit_id}/positions", {
                params: { path: { unit_id: unitId } },
                body: { title },
              }),
            );
          }}
        >
          <Input
            aria-label={t("org.newPosition")}
            placeholder={t("org.newPosition")}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!adding.trim()}>
            <Plus aria-hidden />
            {t("org.addPosition")}
          </Button>
        </form>
      )}
    </SheetSection>
  );
}
