# 0112 — The dev cycle and CI times get faster, alongside the repositories stack

- **Date:** 2026-10-23
- **Status:** Accepted
- **Relates to:** [0110](0110-2026-10-22-repositories-after-1-2.md) (repositories after 1.2), [0053](0053-2026-10-08-code-hosting-and-ci.md) (CI), [0061](0061-2026-10-08-test-strategy.md) (test strategy), [0093](0093-2026-10-16-github-stacked-prs.md) (stacked PRs)

## Context
The owner wants to work on how long a change takes to get from an edit to a green PR: the checks run on a developer's machine, and CI. They want this done around the same time as the refactoring for maintainability and decoupling ([0110](0110-2026-10-22-repositories-after-1-2.md)).

The two belong together:
- **Repositories make the fast tests possible.** Today five areas can only be tested against a real database ([0110](0110-2026-10-22-repositories-after-1-2.md)). Once their SQL sits behind repositories, most of their tests can run in memory.
- **CI is about to get slower.** The [maintainability review](../reviews/2026-10-22-maintainability.md#43-end-to-end-tests) recommends running the browser tests on every PR. That adds about 2–2.5 minutes, so time saved elsewhere pays for it.

What we know today, from the review and from the v1 stack:
- PR CI takes **3 to 7 minutes**. The slowest job is usually `images`: it builds the images (about 1.5 minutes), then starts them for a smoke test (about 1 minute).
- The database tests take **about 13 seconds** on a developer machine.
- **Stacked PRs repeat the checks.** A review fix low in a stack is restacked onto every branch above it ([0093](0093-2026-10-16-github-stacked-prs.md)). Each of those branches then runs the full checks locally and in CI. On the 12-branch v1 stack that took several minutes per fix.

## Decision
1. **The dev cycle and CI times are a planned piece of work.** It comes in the same release as the repositories stack, after 1.1 and 1.2. The exact release is set when that release is planned, as 0110 says.
2. **It starts by measuring, and by profiling** (the owner's choice). Before anything changes, record a baseline:
   - how long each CI job takes, and the time from push to a green `ci-ok`;
   - how long each local check takes, on each side;
   - how long it takes to restack and check a stack.

   Then profile, to find where the time goes rather than guess:
   - **the tests:** the slowest tests and fixtures, and the time spent on setup, such as starting the app or preparing the database;
   - **probably the code under test as well:** a slow test can be slow code, and then the fix belongs in the code, not the test.

   The targets are set from those numbers when the work is planned, not now.
3. **Ideas to weigh then, none decided yet:**
   - Speed up the `images` job, for example with better build caching, or by running the smoke test beside other work.
   - Move tests from the database suite to in-memory tests as each area gets its repository.
   - When a restack changes only one side, check only that side on the branches above.
   - Keep the browser tests on every PR (review, 4.3) inside the time saved.
4. **Until then,** nothing changes. Work that clearly makes CI slower, like the browser tests, says what it costs in its PR.

## Consequences
- The repositories stack and this work are planned together, so the time saved by in-memory tests is measured, not assumed.
- The baseline numbers and the profiling results are recorded in the PR that starts this work, so later changes can show what they saved.
