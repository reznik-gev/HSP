/**
 * Seed the stack before its backup (docs/0106): a published floor with a desk, and a person
 * sitting at it. Nothing is cleaned up: the restore must bring it all back.
 */
import { test } from "@playwright/test";

import { apiAs } from "../api";
import { signIn } from "../session";
import { DRILL } from "./data";

test("seed a floor and someone sitting on it", async ({ page }) => {
  await signIn(page, "admin");
  const api = await apiAs(page);
  const catalog = await api.get<{
    items: { key: string; current_revision: { id: string } }[];
  }>("/catalog-items?limit=200");
  const deskRev = catalog.items.find((i) => i.key === "desk_1600x800")?.current_revision.id;
  const site = await api.post("/sites", { name: DRILL.site, time_zone: "UTC" });
  const building = await api.post("/buildings", {
    site_id: site.id,
    name: DRILL.building,
    code: DRILL.buildingCode,
  });
  const floor = await api.post("/floors", {
    building_id: building.id,
    name: DRILL.floor,
    level_index: 0,
  });
  const deskId = crypto.randomUUID();
  await api.post(`/floors/${floor.id}/lock`);
  await api.post(`/floors/${floor.id}/draft/changesets`, {
    base_revision: 0,
    ops: [
      {
        op: "add",
        kind: "object",
        id: deskId,
        data: {
          catalog_item_rev_id: deskRev,
          position: [2000, 2000, 0],
          allocation_mode: "assigned",
          label: DRILL.seat,
        },
      },
    ],
  });
  await api.post(`/floors/${floor.id}/draft/publish`, { base_revision: 1 });
  await api.delete(`/floors/${floor.id}/lock`);
  const person = await api.post("/people", { display_name: DRILL.person, email: DRILL.email });
  await api.put(`/seats/${deskId}/assignment`, { person_id: person.id });
});
