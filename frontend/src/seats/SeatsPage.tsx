/**
 * "Where does X sit?" (docs/0085, docs/0087): one search over seat labels, people, the team a
 * seat is reserved for and people's primary team. The query lives in the address (?q=), so a
 * search can be shared as a link. "Show on plan" opens the floor centred on the seat.
 */
import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Armchair, MapPin, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { EmptyState, Page } from "@/app/Page";
import { Button } from "@/components/ui/button";

type Seat = components["schemas"]["SeatOut"];

const route = getRouteApi("/shell/seats");

const PAGE_SIZE = 50;

const seatSearchQuery = (q: string) =>
  infiniteQueryOptions({
    queryKey: ["seat-search", q],
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.GET("/api/v1/seats", {
        params: { query: { q, limit: PAGE_SIZE, cursor: pageParam } },
      });
      if (error || !data) throw new Error("Couldn't search seats");
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

export function SeatsPage() {
  const { t } = useTranslation();
  const { q = "" } = route.useSearch();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(q);

  // The address is the source of truth: when it changes from outside (the top-bar search, Back),
  // the field follows, unless it already says the same thing (keeps a trailing space you typed).
  const [shownQ, setShownQ] = useState(q);
  if (q !== shownQ) {
    setShownQ(q);
    if (draft.trim() !== q) setDraft(q);
  }
  // Typing updates the address after a short pause.
  useEffect(() => {
    const next = draft.trim();
    if (next === q) return;
    const timer = setTimeout(
      () => void navigate({ to: "/seats", search: next ? { q: next } : {}, replace: true }),
      300,
    );
    return () => clearTimeout(timer);
  }, [draft, q, navigate]);

  return (
    <Page title={t("seats.title")}>
      <div className="-mt-2 mb-4 flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link to="/seats/free">
            <Armchair aria-hidden />
            {t("freeSeats.title")}
          </Link>
        </Button>
      </div>
      <div className="relative max-w-xl">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.label")}
          // A dedicated search page: the field is what you came for.
          autoFocus
          className="h-10 w-full rounded-md border border-input bg-card ps-9 pe-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>
      <div className="mt-6">
        {q ? <Results q={q} /> : <EmptyState>{t("seats.empty")}</EmptyState>}
      </div>
    </Page>
  );
}

function Results({ q }: { q: string }) {
  const { t } = useTranslation();
  const search = useInfiniteQuery(seatSearchQuery(q));
  if (search.isPending) return null;
  if (search.isError) {
    return (
      <p role="alert" className="text-destructive">
        {t("search.failed")}
      </p>
    );
  }
  const seats = search.data.pages.flatMap((p) => p.items);
  if (seats.length === 0) {
    return <p className="text-muted-foreground">{t("search.none", { q })}</p>;
  }
  return (
    <div>
      <table className="w-full border-collapse overflow-hidden rounded-md border bg-card text-sm">
        <caption className="sr-only">{t("search.results", { q })}</caption>
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {(["seat", "holder", "team", "location"] as const).map((c) => (
              <th key={c} scope="col" className="px-3 py-2 text-start font-normal">
                {t(`search.columns.${c}`)}
              </th>
            ))}
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">{t("search.columns.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {seats.map((s) => (
            <SeatRow key={s.id} seat={s} />
          ))}
        </tbody>
      </table>
      {search.hasNextPage && (
        <Button
          variant="outline"
          className="mt-4"
          disabled={search.isFetchingNextPage}
          onClick={() => void search.fetchNextPage()}
        >
          {t("search.more")}
        </Button>
      )}
    </div>
  );
}

/** A seat nobody holds: free to assign, or not assignable at all (docs/0009). */
function unheldState(seat: Seat): "free" | "bookable" | "unavailable" {
  if (seat.allocation_mode === "bookable") return "bookable";
  if (seat.allocation_mode === "unavailable") return "unavailable";
  return "free";
}

/** One seat: its label, who holds it, their team, where it is, and Show on plan. */
export function SeatRow({ seat }: { seat: Seat }) {
  const { t } = useTranslation();
  const person = seat.holder_person;
  const team = person?.primary_unit?.name ?? seat.holder_unit?.name;
  return (
    <tr className="border-b last:border-b-0">
      <th scope="row" className="px-3 py-2.5 text-start font-medium">
        {seat.label ?? t("plan.unlabelled")}
      </th>
      <td className="px-3 py-2.5">
        {person ? (
          <>
            <div>{person.display_name}</div>
            <div className="text-xs text-muted-foreground" dir="ltr">
              {person.email}
            </div>
          </>
        ) : seat.holder_unit ? (
          <span className="text-muted-foreground">{t("plan.state.unit")}</span>
        ) : (
          <span className="text-muted-foreground">{t(`plan.state.${unheldState(seat)}`)}</span>
        )}
      </td>
      <td className="px-3 py-2.5">{team ?? "–"}</td>
      <td className="px-3 py-2.5 text-muted-foreground">
        {seat.site.name}
        <span className="mx-1" aria-hidden>
          ›
        </span>
        {seat.building.name}
        <span className="mx-1" aria-hidden>
          ›
        </span>
        <span className="text-foreground">{seat.floor.name}</span>
      </td>
      <td className="px-3 py-2.5 text-end">
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/floors/$floorId"
            params={{ floorId: seat.floor.id }}
            search={{ seat: seat.id }}
            aria-label={t("search.showOnPlanFor", { seat: seat.label ?? "" })}
          >
            <MapPin aria-hidden />
            {t("search.showOnPlan")}
          </Link>
        </Button>
      </td>
    </tr>
  );
}
