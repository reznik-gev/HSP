# 0149 — Search finds more than people and seats, after 1.0.0

- **Date:** 2026-11-21
- **Status:** Accepted
- **Refines:** [0085](0085-2026-10-12-seat-assignment-api.md) (point 5: one search over people, teams and seat labels)

## Context
The search box at the top, *Where does… sit?*, answers one question: where someone sits. [0085](0085-2026-10-12-seat-assignment-api.md) point 5 made it one search over a person's name or email, a team's name and a seat's label, and every result is a seat. The owner, checking the demo for [#171](https://github.com/reznik-gev/HSP/pull/171), found that people will expect a search box to find anything in HSP, such as a building or a floor.

## Options considered
- **Widen the search after 1.0.0** ✅: 1.0.0 keeps its scope ([0104](0104-2026-10-21-v1-release-scope-and-support.md)), and the search that ships answers its question well.
- Widen it before 1.0.0: it delays the release for something nobody asked to have in it.
- Keep it to seats: people would keep typing a building's name and finding nothing.

## Decision
1. **After 1.0.0, the search finds more than seats:** at least buildings and floors, and other things people look for by name. *(The owner's choice)*
2. **1.0.0 keeps the search as 0085 made it.** *(The owner's choice)*
3. **The release isn't picked yet.** It goes in whichever release after 1.0.0 has room, like [0145](0145-2026-11-11-office-moves.md)'s move planner. *(Claude's choice)*
4. **What it finds, how results of different kinds are shown together, and whether the box's label changes** are left to the PR that builds it, with its own record. Likely candidates: sites, buildings, floors, zones, and devices by asset tag. *(Claude's choice)*

## Consequences
- Nothing changes in 1.0.0. The user guide still describes the search as it is.
- The work waits for a release after 1.0.0 to be planned.
