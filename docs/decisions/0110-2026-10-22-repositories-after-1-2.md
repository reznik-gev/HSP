# 0110 — Database queries move into repositories, after 1.2

- **Date:** 2026-10-22
- **Status:** Accepted
- **Refines:** [0014](0014-2026-10-08-persistence-layer.md) (layering), [0061](0061-2026-10-08-test-strategy.md) (unit tests against in-memory repositories)

## Context
[0014](0014-2026-10-08-persistence-layer.md) splits the backend into three layers: routers, then services, then repositories that hold the SQL. [0061](0061-2026-10-08-test-strategy.md) builds on that: services are unit-tested against in-memory repositories, with no database.

The [maintainability review](../reviews/2026-10-22-maintainability.md#11-backend) found that only part of the code works this way. Locations and plan reads have repositories. Org, seats, catalog, devices, drafts, publishing and locks write their SQL inside their services (`org/units.py` alone makes 44 queries), so only the database tests can test them. Without the database, unit tests cover 7–35% of that code.

The review offered two ways out: accept both patterns and record when to use each, or move the SQL into repositories. The owner chose to move the SQL, but not now: there are already two PR stacks waiting for review.

## Decision
1. **Every backend area gets a repository** for its database queries. Its service keeps the rules and is unit-tested against an `InMemory*` fake, as 0014 and 0061 say. The areas: org (units, people, imports), seats (assignments, occupancy, search, batch, imports), catalog (items, devices), plans (drafts, publishing, locks) and preferences.
2. **It's done as its own PR stack, one area per PR**, in a release **after AD sync (1.1) and Kubernetes (1.2)** ([0108](0108-2026-10-21-first-client-demo-feedback.md)). Which release exactly is set when that release is planned. The stack is roughly ten PRs. Behaviour doesn't change, so each PR is checked by the existing database tests passing unchanged.
3. **Until then** *(Claude's choice, lower confidence)*: new code follows the pattern of the area it goes into, so a change stays consistent with its neighbours. A **new** area, such as AD sync in 1.1, gets a repository from the start, so it adds no work to the later stack.

## Consequences
- 0014 and 0061 stay as they are. This record says that the code doesn't fully follow them yet, and when it will.
- Until the stack lands, org, seats and catalog stay tested mainly by the database tests (13 seconds on a developer machine). That is slower than unit tests, but the code is covered (82–99%).
- The database tests are the safety net for the move, so none of them should be deleted before or during the stack.
