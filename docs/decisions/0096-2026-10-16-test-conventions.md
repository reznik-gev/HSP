# 0096 — Test data and test-double conventions

- **Date:** 2026-10-16
- **Status:** Accepted
- **Refines:** [0061](0061-2026-10-08-test-strategy.md) (how its tests are written), [0087](0087-2026-10-13-frontend-delivery-plan.md) (choice 8)

## Context
[0061](0061-2026-10-08-test-strategy.md) and [0087](0087-2026-10-13-frontend-delivery-plan.md) decided *which* tests HSP has, not how they're written. In review, the product owner repeatedly asked for the same changes:
- test data built inside test files should be shared stubs or fixtures (#59, #68, #73, #74, #77);
- names should follow the usual test-double vocabulary (#60);
- backend setup should be fixtures, with test files split by area (#68, #69).

These are now written down, so tests are written that way the first time and reviews can point to one place.

0061 also planned to stub the frontend's API with MSW. The frontend instead uses its own `spyBackend`: a small spy on `fetch` that answers with canned replies, which does all the tests need without another library.

## Decision
1. **All test data is fixturized; only what's shared is shared.** No test data is defined inside a test: the body acts and asserts. Data used by one file is defined at the top of that file; data used by more than one file lives in `frontend/src/test/stubs.ts`, `backend/tests/stubs.py` or a shared fixture. Values are built with the stub builders, changing only what matters.
2. **One shared world** of stub data: Tel Aviv HQ › Harbor Tower › Floor 3; Maya Shani in the Platform team, with monitor MON-0412. Tests extend it rather than invent parallel data.
3. **Test doubles are named by kind** ([Fowler](https://martinfowler.com/bliki/TestDouble.html)), after the strongest role a double plays (mock > spy > fake > stub): `STUB_*` / `stub*` / `stub_*` for stubs, `InMemory*` for fakes, `spyBackend` for the API spy (it also answers with canned replies). Mocks that check their own calls aren't used.
4. **Backend:** setup in pytest fixtures (function-level by default, in a `conftest.py` beside the tests); the test body acts and asserts; test files are split by area.
5. **Frontend:** screen tests render the whole app with `renderApp`, query by role and accessible name, check sent requests through the spy, and wait for state rather than time.
6. **[docs/guides/testing.md](../guides/testing.md)** explains these with examples and a review checklist. It is updated when a convention changes.

## Consequences
- Reviews can cite this record and the guide instead of repeating the same comment.
- Existing tests that predate these rules are brought in line in a follow-up change.
- The shared stub modules grow. Each export gets a one-line description, so the modules stay readable as a catalogue.
