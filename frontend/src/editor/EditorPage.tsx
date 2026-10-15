/**
 * The floor editor (docs/0089): a full-screen page that holds the floor's edit lock while open.
 * It opens the draft, or the published plan when there is no draft yet, and saves every change
 * to the draft as you go. Tools: select, walls, doors, windows, columns, zones and catalog
 * items; the Properties and Problems panels arrive in the following steps of phase 3a.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { problemMessage } from "@/api/problems";
import { Interaction } from "@/editor/core/interaction";
import { createEditorStore, type EditorStore } from "@/editor/core/store";
import { ViewerInteraction } from "@/editor/core/viewerInteraction";
import { EditOverlay } from "@/editor/view-svg/EditOverlay";
import { PlanView, type RenderOptions } from "@/editor/view-svg/PlanView";
import { fitPlan, useElementSize, ZoomControls } from "@/editor/view-svg/ZoomControls";
import { floorPlaceQuery, zoneTypesQuery } from "@/floors/planData";
import { notify, notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";

import { EditorTopBar } from "./EditorTopBar";
import { LockMessage } from "./LockMessage";
import { editorPlanQuery } from "./session/editorPlan";
import { useEditLock } from "./session/lock";
import { useEditSession } from "./session/useEditSession";
import { SidePanel } from "./SidePanel";
import { ToolOptions } from "./ToolOptions";
import { ToolStrip } from "./ToolStrip";
import { useEditorKeys } from "./useEditorKeys";

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
  const navigate = useNavigate();
  const client = useQueryClient();
  const [store] = useState(createEditorStore);
  const [interaction] = useState(() => new Interaction(store));
  const place = useQuery(floorPlaceQuery(floorId));
  const lock = useEditLock(floorId);
  const held = lock.state.kind === "held";
  const publishedVersion = place.data?.floor.published_version ?? null;
  const planQuery = editorPlanQuery(floorId, publishedVersion);
  const editorPlan = useQuery({
    ...planQuery,
    // Read the draft only once the lock is ours, so nobody changes it under us.
    enabled: (held || lock.state.kind === "lost") && place.isSuccess,
  });
  const zoneTypes = useQuery(zoneTypesQuery);
  const { autosave, save } = useEditSession(store, floorId, editorPlan.data, zoneTypes.data, held, {
    onReload: (reason, problem) => {
      if (reason === "stale") notify(t("editor.reloaded"));
      else notifyError(problemMessage(problem, t("editor.rejected")));
      void client.invalidateQueries({ queryKey: planQuery.queryKey });
    },
    onLockLost: lock.markLost,
  });
  useEditorKeys(store, interaction, held);
  const wallHeight = place.data?.floor.default_wall_height_mm;
  useEffect(() => {
    if (wallHeight) store.getState().setWallDefaults({ height_mm: wallHeight });
  }, [store, wallHeight]);
  // New zones are rooms unless the admin picks another type.
  useEffect(() => {
    const types = zoneTypes.data;
    if (!types?.size || store.getState().zoneTypeId) return;
    const room = [...types].find(([, z]) => z.name === "Room");
    store.getState().setZoneType((room ?? [...types][0]!)[0]);
  }, [store, zoneTypes.data]);

  // Exit saves what's left first. If that fails, a second Exit leaves without it.
  const [leaveAnyway, setLeaveAnyway] = useState(false);
  const exit = async () => {
    await autosave?.flush();
    if (store.getState().outbox.length && !leaveAnyway) {
      setLeaveAnyway(true);
      notifyError(t("editor.unsavedExit"));
      return;
    }
    await navigate({ to: "/floors/$floorId", params: { floorId } });
  };

  const failed = editorPlan.isError || place.isError || zoneTypes.isError;
  return (
    <>
      <EditorTopBar
        floorName={place.data?.floor.name ?? null}
        store={store}
        source={editorPlan.data?.source ?? null}
        publishedVersion={publishedVersion}
        save={save}
        onExit={() => void exit()}
      />
      <LockMessage state={lock.state} onRetry={lock.retry} onTakeOver={lock.takeOver} />
      {failed ? (
        <p role="alert" className="p-6 text-destructive">
          {t("plan.loadFailed")}
        </p>
      ) : editorPlan.data && zoneTypes.data ? (
        <div className="flex min-h-0 flex-1">
          <ToolStrip store={store} disabled={!held} />
          <Canvas store={store} interaction={interaction} editable={held} />
          {held && <SidePanel store={store} />}
        </div>
      ) : (
        lock.state.kind === "acquiring" && (
          <div className="flex-1 bg-[var(--plan-paper)]" aria-busy="true" />
        )
      )}
    </>
  );
}

function Canvas({
  store,
  interaction,
  editable,
}: {
  store: EditorStore;
  interaction: Interaction;
  editable: boolean;
}) {
  const [viewing] = useState(() => new ViewerInteraction(store));
  const tool = useStore(store, (s) => s.tool);
  const canvas = useRef<HTMLDivElement>(null);
  const size = useElementSize(canvas);
  const generation = useStore(store, (s) => s.generation);

  useEffect(() => {
    if (size) fitPlan(store, size);
    // Fit when a plan is loaded and once the canvas has a size, not on every resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, generation, size === null]);

  return (
    <div
      ref={canvas}
      // Working on the plan takes the keyboard away from any field, for the editor's shortcuts.
      onPointerDownCapture={() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }}
      className={cn("relative min-w-0 flex-1", editable && tool !== "select" && "cursor-crosshair")}
    >
      <PlanView
        store={store}
        interaction={editable ? interaction : viewing}
        options={OPTIONS}
        overlay={<EditOverlay store={store} />}
      />
      <ZoomControls store={store} size={size} />
      {editable && <ToolOptions store={store} />}
    </div>
  );
}
