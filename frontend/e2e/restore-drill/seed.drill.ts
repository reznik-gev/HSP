/**
 * Seed the stack before its backup (docs/0106): a published floor with a desk, and a person
 * sitting at it. Nothing is cleaned up: the restore must bring it all back.
 */
import { test } from "@playwright/test";

import { apiAs, seedSeatedPerson } from "../api";
import { signIn } from "../session";
import { DRILL } from "./data";

test("seed a floor and someone sitting on it", async ({ page }) => {
  await signIn(page, "admin");
  await seedSeatedPerson(await apiAs(page), {
    site: DRILL.site,
    building: DRILL.building,
    code: DRILL.buildingCode,
    floor: DRILL.floor,
    seat: DRILL.seat,
    person: DRILL.person,
    email: DRILL.email,
  });
});
