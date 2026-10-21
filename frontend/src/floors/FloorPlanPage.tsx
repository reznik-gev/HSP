/**
 * The read-only floor plan (docs/0087, phase 1 step 5): the published version of a floor, with
 * seats coloured by state, a hover tooltip and a details panel. `?seat=<id>` selects and centres
 * a seat (used by search). The drawing never mirrors in Hebrew; the panels around it do.
 */
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Armchair, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { AdminOnly } from "@/auth/admin";
import { Button } from "@/components/ui/button";
import { planFromApi } from "@/editor/core/fromApi";
import { createEditorStore } from "@/editor/core/store";
import { ViewerInteraction } from "@/editor/core/viewerInteraction";
import { PlanCanvas } from "@/editor/view-svg/PlanCanvas";
import type { SeatState } from "@/editor/view-svg/PlanView";
import { fitPlan } from "@/editor/view-svg/ZoomControls";
import { cn } from "@/lib/utils";
import { SeatActions } from "@/seats/SeatActions";

import { EditFloorButton } from "./EditFloorButton";

import {
  floorPlaceQuery,
  floorSeatsQuery,
  publishedPlanQuery,
  type Seat,
  seatStates,
  zoneTypesQuery,
} from "./planData";

const route = getRouteApi("/shell/floors/$floorId");

const STATES: SeatState[] = ["person", "unit", "free", "bookable", "unavailable"];

export function FloorPlanPage() {
  const { t } = useTranslation();
  const { floorId } = route.useParams();
  const { seat: seatParam } = route.useSearch();
  const place = useQuery(floorPlaceQuery(floorId));
  const version = place.data?.floor.published_version ?? null;
  const apiPlan = useQuery({ ...publishedPlanQuery(floorId, version ?? 0), enabled: !!version });
  const zoneTypes = useQuery(zoneTypesQuery);
  const seats = useQuery(floorSeatsQuery(floorId));
  // "Show free seats" (docs/0108): the free and bookable seats stand out.
  const [onlyFree, setOnlyFree] = useState(false);

  const plan = useMemo(
    () => (apiPlan.data && zoneTypes.data ? planFromApi(apiPlan.data, zoneTypes.data) : null),
    [apiPlan.data, zoneTypes.data],
  );
  const states = useMemo(
    () => (plan && seats.data ? seatStates(plan, seats.data) : new Map<string, SeatState>()),
    [plan, seats.data],
  );

  const failed = place.isError || apiPlan.isError || zoneTypes.isError || seats.isError;
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b bg-card px-6 py-3">
        <div className="min-w-0">
          <nav aria-label={t("plan.breadcrumb")} className="text-xs text-muted-foreground">
            <Link to="/floors" className="hover:text-foreground hover:underline">
              {t("floors.title")}
            </Link>
            {place.data && (
              <span>
                <Separator />
                {place.data.site.name}
                <Separator />
                {place.data.building.name}
              </span>
            )}
          </nav>
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {place.data?.floor.name ?? " "}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {plan && states.size > 0 && (
            <Button
              size="sm"
              variant={onlyFree ? "default" : "outline"}
              aria-pressed={onlyFree}
              onClick={() => setOnlyFree(!onlyFree)}
            >
              <Armchair aria-hidden />
              {t("plan.showFree", {
                count: [...states.values()].filter((s) => s === "free" || s === "bookable").length,
              })}
            </Button>
          )}
          {version && (
            <span className="text-xs text-muted-foreground">{t("plan.version", { version })}</span>
          )}
          <AdminOnly>
            <EditFloorButton floorId={floorId} />
          </AdminOnly>
        </div>
      </header>
      {failed ? (
        <p role="alert" className="p-6 text-destructive">
          {t("plan.loadFailed")}
        </p>
      ) : place.data && !version ? (
        <p className="p-6 text-muted-foreground">{t("plan.notPublished")}</p>
      ) : plan ? (
        <Viewer
          plan={plan}
          states={states}
          seats={seats.data}
          focusSeat={seatParam}
          onlyFree={onlyFree}
        />
      ) : (
        <div className="flex-1 bg-[var(--plan-paper)]" aria-busy="true" />
      )}
    </div>
  );
}

function Separator() {
  return (
    <span className="mx-1.5" aria-hidden>
      ›
    </span>
  );
}

function Viewer({
  plan,
  states,
  seats,
  focusSeat,
  onlyFree,
}: {
  plan: ReturnType<typeof planFromApi>;
  states: ReadonlyMap<string, SeatState>;
  seats: ReadonlyMap<string, Seat> | undefined;
  focusSeat: string | undefined;
  onlyFree: boolean;
}) {
  const [store] = useState(createEditorStore);
  const [viewer] = useState(() => new ViewerInteraction(store));
  const [hover, setHover] = useState<{ id: string; sx: number; sy: number } | null>(null);
  const selection = useStore(store, (s) => s.selection);
  const selected = [...selection].find((id) => states.has(id)) ?? null;

  // Load the plan, then either centre the requested item or fit the whole floor. The item is
  // usually a seat (its panel opens); a device's item, e.g. a monitor, is only highlighted.
  useEffect(() => {
    store.getState().loadPlan(plan);
  }, [store, plan]);
  const fit = (s: typeof store, size: [number, number]) => {
    const obj = focusSeat ? plan.objects[focusSeat] : undefined;
    if (obj) {
      s.getState().select([obj.id]);
      // Close enough to read labels, far enough to see the neighbours.
      s.getState().setViewport({ cx: obj.position[0], cy: obj.position[1], mmPerPx: 14 });
    } else fitPlan(s, size);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <PlanCanvas
        store={store}
        fitKey={focusSeat}
        fit={fit}
        view={{
          interaction: viewer,
          seatStates: states,
          onlyFree,
          onHover: (p) => {
            const id = p ? viewer.seatAt(p.sx, p.sy) : null;
            setHover(id && p ? { id, sx: p.sx, sy: p.sy } : null);
          },
        }}
      >
        {hover && (
          <SeatTooltip
            seatId={hover.id}
            seat={seats?.get(hover.id)}
            label={plan.objects[hover.id]?.label ?? null}
            state={states.get(hover.id)}
            x={hover.sx}
            y={hover.sy}
          />
        )}
        <Legend />
      </PlanCanvas>
      {selected && (
        <SeatPanel
          seatId={selected}
          label={plan.objects[selected]?.label ?? null}
          state={states.get(selected)}
          seat={seats?.get(selected)}
          onClose={() => store.getState().clearSelection()}
        />
      )}
    </div>
  );
}

function Legend() {
  const { t } = useTranslation();
  return (
    <ul
      aria-label={t("plan.legend")}
      className="absolute start-3 bottom-3 flex flex-wrap gap-x-4 gap-y-1 rounded-md border bg-card px-3 py-2 text-xs shadow-sm"
    >
      {STATES.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <Swatch state={s} />
          {t(`plan.state.${s}`)}
        </li>
      ))}
    </ul>
  );
}

function Swatch({ state }: { state: SeatState }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-3 rounded-[3px] border",
        state === "free" && "border-[var(--seat-free-stroke)]",
        state === "unavailable" && "border-dashed",
      )}
      style={{ background: `var(--seat-${state})` }}
    />
  );
}

function holderName(seat: Seat | undefined): string | null {
  return seat?.holder_person?.display_name ?? seat?.holder_unit?.name ?? null;
}

function SeatTooltip({
  seatId,
  seat,
  label,
  state,
  x,
  y,
}: {
  seatId: string;
  seat: Seat | undefined;
  label: string | null;
  state: SeatState | undefined;
  x: number;
  y: number;
}) {
  const { t } = useTranslation();
  return (
    <div
      key={seatId}
      role="tooltip"
      className="pointer-events-none absolute z-10 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md"
      // The canvas is always left-to-right (it never mirrors), so physical offsets are right.
      style={{ transform: `translate(${x + 14}px, ${y + 14}px)`, left: 0, top: 0 }}
    >
      <div className="font-medium">{label ?? t("plan.unlabelled")}</div>
      <div className="opacity-80">{holderName(seat) ?? (state && t(`plan.state.${state}`))}</div>
    </div>
  );
}

function SeatPanel({
  seatId,
  label,
  state,
  seat,
  onClose,
}: {
  seatId: string;
  label: string | null;
  state: SeatState | undefined;
  seat: Seat | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const person = seat?.holder_person;
  const unit = seat?.holder_unit;
  return (
    <aside aria-label={t("plan.seatDetails")} className="w-80 shrink-0 border-s bg-card">
      <div className="flex items-start justify-between gap-2 border-b px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">{label ?? t("plan.unlabelled")}</h2>
          {state && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Swatch state={state} />
              {t(`plan.state.${state}`)}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" aria-label={t("plan.close")} onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      <div className="space-y-1 px-5 py-4">
        {person ? (
          <>
            <p className="font-medium">{person.display_name}</p>
            <p className="text-muted-foreground" dir="ltr">
              {person.email}
            </p>
            {person.primary_unit && (
              <p className="text-muted-foreground">{person.primary_unit.name}</p>
            )}
          </>
        ) : unit ? (
          <p>{t("plan.reservedFor", { unit: unit.name })}</p>
        ) : (
          state && <p className="text-muted-foreground">{t(`plan.explain.${state}`)}</p>
        )}
      </div>
      {/* Bookable and unavailable seats change mode in the floor plan, not here (docs/0031). */}
      {(state === "person" || state === "unit" || state === "free") && (
        <AdminOnly>
          <SeatActions
            key={seatId}
            seatId={seatId}
            label={label ?? t("plan.unlabelled")}
            current={
              person
                ? { person_id: person.id, name: person.display_name }
                : unit
                  ? { unit_id: unit.id, name: unit.name }
                  : null
            }
          />
        </AdminOnly>
      )}
    </aside>
  );
}
