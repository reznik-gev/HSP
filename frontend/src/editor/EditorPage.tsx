/**
 * The floor editor (docs/0089): a full-screen page that holds the floor's edit lock while open.
 * It opens the draft, or the published plan when there is no draft yet. The tools, the side
 * panel and saving arrive in the following steps of phase 3a.
 */
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Redo2, Undo2, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { planFromApi } from "@/editor/core/fromApi";
import { createEditorStore } from "@/editor/core/store";
import { ViewerInteraction } from "@/editor/core/viewerInteraction";
import { PlanView, type RenderOptions } from "@/editor/view-svg/PlanView";
import { fitPlan, useElementSize, ZoomControls } from "@/editor/view-svg/ZoomControls";
import { useLockedByText } from "@/floors/EditFloorButton";
import { floorPlaceQuery, zoneTypesQuery } from "@/floors/planData";

import { type EditorPlan, editorPlanQuery } from "./session/editorPlan";
import { type LockState, useEditLock } from "./session/lock";

const route = getRouteApi("/editor/floors/$floorId/edit");

const OPTIONS: RenderOptions = {
  labels: true,
  hatching: false,
  doorArcs: true,
  zoneFills: true,
  lod: true,
};

export function EditorPage() {
  const { t } = useTranslation();
  const { floorId } = route.useParams();
  const place = useQuery(floorPlaceQuery(floorId));
  const lock = useEditLock(floorId);
  const held = lock.state.kind === "held" || lock.state.kind === "lost";
  const editorPlan = useQuery({
    ...editorPlanQuery(floorId, place.data?.floor.published_version ?? null),
    // Read the draft only once the lock is ours, so nobody changes it under us.
    enabled: held && place.isSuccess,
  });
  const zoneTypes = useQuery(zoneTypesQuery);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/floors/$floorId" params={{ floorId }}>
            <X aria-hidden />
            {t("editor.exit")}
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">
            {place.data ? t("editor.title", { floor: place.data.floor.name }) : " "}
          </h1>
          {editorPlan.data && (
            <p className="text-xs text-muted-foreground">
              <DraftStatus editorPlan={editorPlan.data} />
            </p>
          )}
        </div>
        {/* Wired to the edit history in the next step (docs/0050). */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={t("editor.undo")} disabled>
            <Undo2 aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" aria-label={t("editor.redo")} disabled>
            <Redo2 aria-hidden />
          </Button>
        </div>
      </header>
      <LockMessage state={lock.state} onRetry={lock.retry} onTakeOver={lock.takeOver} />
      {held &&
        (editorPlan.isError || place.isError || zoneTypes.isError ? (
          <p role="alert" className="p-6 text-destructive">
            {t("plan.loadFailed")}
          </p>
        ) : editorPlan.data && zoneTypes.data ? (
          <Canvas editorPlan={editorPlan.data} zoneTypes={zoneTypes.data} />
        ) : (
          <div className="flex-1 bg-[var(--plan-paper)]" aria-busy="true" />
        ))}
    </>
  );
}

function DraftStatus({ editorPlan }: { editorPlan: EditorPlan }) {
  const { t } = useTranslation();
  const { plan, source } = editorPlan;
  if (source === "draft") return t("editor.status.draft", { version: plan.version });
  if (source === "published") return t("editor.status.published", { version: plan.version });
  return t("editor.status.new");
}

/** Why editing isn't possible right now, and what to do about it. */
function LockMessage({
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

function Canvas({
  editorPlan,
  zoneTypes,
}: {
  editorPlan: EditorPlan;
  zoneTypes: ReadonlyMap<string, { name: string; color: string | null }>;
}) {
  const [store] = useState(createEditorStore);
  const [viewer] = useState(() => new ViewerInteraction(store));
  const canvas = useRef<HTMLDivElement>(null);
  const size = useElementSize(canvas);
  const plan = useMemo(() => planFromApi(editorPlan.plan, zoneTypes), [editorPlan, zoneTypes]);

  useEffect(() => {
    store.getState().loadPlan(plan);
  }, [store, plan]);
  useEffect(() => {
    if (size) fitPlan(store, size);
    // Fit once the canvas has a size, not on every resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, plan, size === null]);

  return (
    <div ref={canvas} className="relative min-h-0 flex-1">
      <PlanView store={store} interaction={viewer} options={OPTIONS} />
      <ZoomControls store={store} size={size} />
    </div>
  );
}
