/**
 * Undo for archiving a team (docs/0088 choice 6): replays the release report in reverse.
 * Teams come back top-down, moved members get their old memberships back (the parent membership
 * is removed only if the move created it), and team-held seats are reserved again if still free.
 * Nothing is taken from anyone: a seat given away meanwhile is skipped and counted.
 */
import { api } from "@/api/client";
import type { components } from "@/api/schema";

type ReleaseReport = components["schemas"]["ReleaseReport"];
type MembershipIn = components["schemas"]["MembershipIn"];

export async function undoUnitArchive(report: ReleaseReport): Promise<{ skippedSeats: number }> {
  // The report lists the archived team first, then its sub-teams top-down.
  for (const item of report.archived) {
    await api.POST("/api/v1/org-units/{unit_id}/restore", {
      params: { path: { unit_id: item.id } },
    });
  }
  for (const moved of report.moved_members) {
    const { data: person } = await api.GET("/api/v1/people/{person_id}", {
      params: { path: { person_id: moved.person_id } },
    });
    if (!person) continue;
    const restoredPrimary = moved.previous.some((p) => p.is_primary);
    const keep: MembershipIn[] = person.memberships
      .filter((m) => moved.merged || m.unit_id !== moved.to_unit_id)
      .map((m) => ({
        unit_id: m.unit_id,
        position_id: m.position_id,
        is_primary: restoredPrimary ? false : m.is_primary,
      }));
    const back: MembershipIn[] = moved.previous.map((p) => ({
      unit_id: p.unit_id,
      position_id: p.position_id,
      is_primary: p.is_primary,
    }));
    const all = [...keep, ...back];
    await api.PUT("/api/v1/people/{person_id}/memberships", {
      params: { path: { person_id: moved.person_id } },
      // A lone team is primary by itself (docs/0084).
      body: all.length === 1 ? all.map((m) => ({ ...m, is_primary: false })) : all,
    });
  }
  let skippedSeats = 0;
  for (const seat of report.freed_seats) {
    if (!seat.holder_unit_id) continue;
    const { data } = await api.GET("/api/v1/seats/{seat_id}/assignment", {
      params: { path: { seat_id: seat.seat_id } },
    });
    if (!data || data.assignment) {
      skippedSeats += 1;
      continue;
    }
    await api.PUT("/api/v1/seats/{seat_id}/assignment", {
      params: { path: { seat_id: seat.seat_id } },
      body: { unit_id: seat.holder_unit_id },
    });
  }
  return { skippedSeats };
}
