/**
 * The floor editor (docs/0089): a full-screen page that holds the floor's edit lock while open.
 * It opens the draft, or the published plan when there is no draft yet, and saves every change
 * to the draft as you go. Tools: select, walls, doors, windows, columns, zones and catalog
 * items, with Properties and Problems panels. Publishing arrives in the next step of phase 3a.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { Interaction } from "@/editor/core/interaction";
import { createEditorStore, type EditorStore } from "@/editor/core/store";
import { ViewerInteraction } from "@/editor/core/viewerInteraction";
import { EditOverlay } from "@/editor/view-svg/EditOverlay";
import { GridUnderlay } from "@/editor/view-svg/GridUnderlay";
import { PlanCanvas } from "@/editor/view-svg/PlanCanvas";
import { floorPlaceQuery, zoneTypesQuery } from "@/floors/planData";
import { notify, notifyError } from "@/lib/notify";
import { preferencesQuery } from "@/lib/preferences";
import { cn } from "@/lib/utils";

import { EditorTopBar } from "./EditorTopBar";
import { GridControls } from "./GridControls";
import { MeasureInput } from "./MeasureInput";
import { HistorySheet } from "./publish/HistorySheet";
import { PublishDialog } from "./publish/PublishDialog";
import { useDraftActions } from "./publish/useDraftActions";
import { LockMessage } from "./LockMessage";
import { editorPlanQuery } from "./session/editorPlan";
import { useEditLock } from "./session/lock";
import { problemsFromRefusal } from "./problems/fromServer";
import { useEditSession } from "./session/useEditSession";
import { SidePanel } from "./SidePanel";
import { ToolOptions } from "./ToolOptions";
import { ToolStrip } from "./ToolStrip";
import { useEditorKeys } from "./useEditorKeys";

const route = getRouteApi("/editor/floors/$floorId/edit");

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
    onStale: () => {
      notify(t("editor.reloaded"));
      void client.invalidateQueries({ queryKey: planQuery.queryKey });
    },
    // The change is already taken back; say why, and show where (docs/0090).
    onRejected: (problem, change) => {
      const found = problemsFromRefusal(problem, change);
      const s = store.getState();
      s.addProblems(found);
      s.setPanelTab("problems");
      const where = found.find((p) => p.elementId)?.elementId;
      if (where) interaction.focus(where);
      notifyError(t("editor.rejected"));
    },
    onLockLost: lock.markLost,
  });
  useEditorKeys(store, interaction, held);
  const wallHeight = place.data?.floor.default_wall_height_mm;
  useEffect(() => {
    if (wallHeight) store.getState().setWallDefaults({ height_mm: wallHeight });
  }, [store, wallHeight]);
  const preferences = useQuery(preferencesQuery).data;
  const units = preferences?.display_units;
  const gridMm = preferences?.grid_mm;
  useEffect(() => {
    if (gridMm) store.getState().setGridMm(gridMm);
  }, [store, gridMm]);
  useEffect(() => {
    if (units) store.getState().setDisplayUnit(units);
  }, [store, units]);
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
    if (store.getState().pending.length && !leaveAnyway) {
      setLeaveAnyway(true);
      notifyError(t("editor.unsavedExit"));
      return;
    }
    await navigate({ to: "/floors/$floorId", params: { floorId } });
  };

  const floorName = place.data?.floor.name ?? "";
  const actions = useDraftActions({
    floorId,
    floorName,
    store,
    autosave,
    reload: () => client.refetchQueries({ queryKey: planQuery.queryKey }),
  });
  const hasDraft = save.version !== null;
  const draft = useStore(store, (s) => s.document);

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
        onHistory={() => actions.setHistory(true)}
        onDiscard={held && hasDraft ? () => void actions.discard() : null}
        onPublish={held && hasDraft ? () => void actions.openPublish() : null}
      />
      {hasDraft && draft && (
        <PublishDialog
          floorId={floorId}
          floorName={floorName}
          publishedVersion={publishedVersion}
          draftVersion={save.version!}
          document={draft}
          baseRevision={() => autosave?.savedRevision ?? 0}
          open={actions.publishing}
          onOpenChange={actions.setPublishing}
          onPublished={actions.onPublished}
          onRefused={actions.onRefused}
        />
      )}
      <HistorySheet
        floorId={floorId}
        hasDraft={hasDraft}
        open={actions.history}
        onClose={() => actions.setHistory(false)}
        onRestored={actions.onRestored}
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
          {held && <SidePanel store={store} interaction={interaction} />}
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
  return (
    <PlanCanvas
      store={store}
      view={{
        interaction: editable ? interaction : viewing,
        underlay: editable ? <GridUnderlay store={store} /> : undefined,
        overlay: <EditOverlay store={store} />,
      }}
      className={cn(editable && tool !== "select" && "cursor-crosshair")}
      // Working on the plan takes the keyboard away from any field, for the editor's shortcuts;
      // the boxes and bars over the plan keep it.
      onPointerDownCapture={(e) => {
        if (!(e.target instanceof Element) || !e.target.closest("svg[data-lod]")) return;
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }}
    >
      {editable && <ToolOptions store={store} />}
      {editable && <GridControls store={store} />}
      {editable && <MeasureInput store={store} interaction={interaction} />}
    </PlanCanvas>
  );
}
