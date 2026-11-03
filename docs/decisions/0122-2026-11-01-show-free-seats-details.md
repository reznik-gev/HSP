# 0122 — "Show free seats": what counts, and how the plan shows it

- **Date:** 2026-11-01
- **Status:** Accepted
- **Refines:** [0108](0108-2026-10-21-first-client-demo-feedback.md) (point 4)

## Context
[0108](0108-2026-10-21-first-client-demo-feedback.md) point 4 asked for a "Show free seats" toggle on the floor plan that dims everything but the free seats, with no blinking. Building it needed a few smaller choices that 0108 didn't make. The owner chose the first two and the last one. The rest are *(Claude's choice)*: lower-confidence, and open to change if the owner or users see it differently. The owner asked to check two of them with clients at the next demos.

## Decisions
- **Bookable seats count as free.** "Free" here means a seat someone could take: free to assign, or free to book. It's the same set the API calls `status=available` (the free seats list, from 0108 point 4). Seats that are unavailable never count. *(The owner's choice)*
- **The button shows how many:** "Show free seats (N)", so you know before turning it on whether there's anything to find. *(The owner's choice)*
- **Everything else fades to 15%:** other seats and furniture, zones, their labels, and the height tags of raised items. Walls, doors and windows stay, so the room still reads. *(Claude's choice; to check at the next demos)*
- **Available seats get a heavier outline**, so they stand out even where they're small on screen. A selected seat keeps its selected look. *(Claude's choice; to check at the next demos)*
- **The toggle is kept in the page's address** (`?free=true`, next to `?seat`). It stays on when you reload, and a link sent while it's on opens with it on, for example "pick a free desk on Floor 3". The free seats list can link to the plan the same way. *(The owner's choice)*

## Consequences
- One rule says what an available seat is (`isAvailableSeat` in the plan view). The button's count, the faded plan and the API's `status=available` must agree; if unavailable seats ever count, all three change together.
- The [demo script](../demos/northwind-robotics.md) asks clients about the fading and the outline. Their answers go in that demo's feedback notes, and a new record if either changes.
