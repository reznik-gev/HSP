/**
 * Seed the sizing bench's office (deploy/measure-size.sh): HSP_SIZING_PEOPLE people (default
 * 1,000), each at their own desk. One building, 500 desks to a floor, made through the API as an
 * admin would.
 */
import { test } from "@playwright/test";

import { apiAs, type Api } from "../api";
import { signIn } from "../session";
import { DESKS_PER_FLOOR, DESKS_PER_ROW, PEOPLE, seatOf } from "./office";

/** Requests at once while adding people: about what an import does. */
const PARALLEL = 8;

test.setTimeout(60 * 60_000);

/** Runs `work` for every item, `PARALLEL` at a time. */
async function inParallel<T>(items: T[], work: (item: T) => Promise<void>) {
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
}

/** A published floor of desks, each assigned to nobody yet. Returns their ids, in label order. */
async function floorOfDesks(api: Api, buildingId: string, level: number, deskRev: string) {
  const floor = await api.post("/floors", {
    building_id: buildingId,
    name: seatOf(level * DESKS_PER_FLOOR + 1).floor,
    level_index: level,
  });
  const desks = Array.from({ length: DESKS_PER_FLOOR }, (_, i) => ({
    id: crypto.randomUUID(),
    position: [1000 + (i % DESKS_PER_ROW) * 2000, 1000 + Math.floor(i / DESKS_PER_ROW) * 1200, 0],
    label: seatOf(level * DESKS_PER_FLOOR + i + 1).label,
  }));
  await api.post(`/floors/${floor.id}/lock`);
  await api.post(`/floors/${floor.id}/draft/changesets`, {
    base_revision: 0,
    ops: desks.map((d) => ({
      op: "add",
      kind: "object",
      id: d.id,
      data: {
        catalog_item_rev_id: deskRev,
        position: d.position,
        allocation_mode: "assigned",
        label: d.label,
      },
    })),
  });
  await api.post(`/floors/${floor.id}/draft/publish`, { base_revision: 1 });
  await api.delete(`/floors/${floor.id}/lock`);
  return desks.map((d) => d.id);
}

test(`an office of ${PEOPLE} people`, async ({ page }) => {
  await signIn(page, "admin");
  const api = await apiAs(page);
  const catalog = await api.get<{
    items: { key: string; current_revision: { id: string } }[];
  }>("/catalog-items?limit=200");
  const deskRev = catalog.items.find((i) => i.key === "desk_1600x800")?.current_revision.id;
  if (!deskRev) throw new Error("the catalog has no desk_1600x800");
  const site = await api.post("/sites", { name: "Sizing HQ", time_zone: "UTC" });
  const building = await api.post("/buildings", { site_id: site.id, name: "Sizing", code: "SZ" });
  const desks: string[] = [];
  for (let level = 0; desks.length < PEOPLE; level++) {
    desks.push(...(await floorOfDesks(api, building.id, level, deskRev)));
  }
  await inParallel([...desks.slice(0, PEOPLE).entries()], async ([i, deskId]) => {
    const { person: display_name, email } = seatOf(i + 1);
    const person = await api.post("/people", { display_name, email });
    await api.put(`/seats/${deskId}/assignment`, { person_id: person.id });
  });
});
