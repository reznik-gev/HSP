# 0123 — The free seats list: where it lives and how it filters

- **Date:** 2026-11-03
- **Status:** Accepted
- **Refines:** [0108](0108-2026-10-21-first-client-demo-feedback.md) (point 4)

## Context
[0108](0108-2026-10-21-first-client-demo-feedback.md) point 4 asked for a list of free seats, "filtered by site, building, floor, zone, and bookable or not". [0122](0122-2026-11-01-show-free-seats-details.md) settled what counts as free for the plan's toggle: bookable seats count, unavailable ones never do. The list uses the same rule (the API's `status=available`). Building the list needed a few smaller choices. The owner chose the first, the fourth and the last. The rest are *(Claude's choice)*: lower-confidence, and open to change if the owner or users see it differently.

## Decisions
- **It lives under Seats,** at `/seats/free`, with a "Free seats" button on the seat search and a "Find someone's seat" link back. It has no sidebar item of its own: both pages answer "where is a seat?", and the sidebar stays short. *(The owner's choice)*
- **Places narrow one inside another:** site, then building, then floor, then zone. Each list is empty until the place above it is chosen, and choosing another place clears the narrower ones under it. Zones come from the floor's published plan. *(Claude's choice)*
- **The kind filter has three options:** "Free or bookable" (the default), "Free to assign" and "Bookable". *(Claude's choice)*
- **The filters live in the address,** like the seat search's `?q` and the plan's `?free` (0122), so a list can be shared as a link and survives a reload. *(The owner's choice)*
- **The results are the seat search's table,** with the same columns and "Show on plan" on each row. *(Claude's choice)*
- **"Show on plan" turns on "Show free seats"** (`?free=true`, 0122), so you see that seat among the other free ones. The seat search's "Show on plan" opens the plan as it is. *(The owner's choice)*

## Consequences
- The seat search and the free seats list share one table (`SeatTable` in `SeatsPage.tsx`), so a column change happens in one place.
- The site, building and floor lists come from shared queries (`floors/locationQueries.ts`), ready for the next site → building → floor picker.
