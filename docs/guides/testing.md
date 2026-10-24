# Writing tests

How HSP is tested, where the shared test data lives, and the conventions a review checks ([0096](../decisions/0096-2026-10-16-test-conventions.md)). The strategy itself, meaning which kinds of tests exist and what each must cover, is in [0061](../decisions/0061-2026-10-08-test-strategy.md) and [0087](../decisions/0087-2026-10-13-frontend-delivery-plan.md) (choice 8).

## The kinds of tests

| Kind | Where | Runs with | What it's for |
|---|---|---|---|
| Editor core | `frontend/src/editor/core/*.test.ts` | Vitest, Node | Tools, snapping, hit-testing, operations and undo, without a browser. |
| Screen tests | `frontend/src/**/*.test.tsx` | Vitest, jsdom | The real app rendered at a path against a stubbed API; checks what the user sees and what was sent. |
| Browser tests | `frontend/e2e/*.spec.ts` | Playwright | A few key flows end to end: against the running dev stack, and in the release workflow against the installed bundle ([0102](../decisions/0102-2026-10-19-release-workflow.md)). |
| Backend unit | `backend/tests/unit/` | pytest | Services and rules against fakes and stubs; no Docker. |
| Database | `backend/tests/db/` | pytest + PostGIS | What only a real database can check ([0061](../decisions/0061-2026-10-08-test-strategy.md) lists it). |
| Backup service | `backup/tests/` | pytest + moto | `hsp-backup`'s config, archives, targets, retention and schedules, with PostgreSQL faked and S3 faked by moto. |
| Restore test | `deploy/test-restore.sh`, `frontend/e2e/restore-drill/*.drill.ts` | weekly workflow | Seeds an installed bundle, backs it up, restores into a fresh database, and compares every table ([0106](../decisions/0106-2026-10-21-backups.md)). Runs every Monday, by hand (Actions → restore drill), and on PRs that change backups. |
| Upgrade test | `deploy/test-upgrade.sh` | release workflow | Installs the last release, upgrades it with `hsp upgrade`, checks it, rolls back with `hsp rollback` and checks again ([0107](../decisions/0107-2026-10-21-operator-cli.md)). Skipped until a release exists. |
| Shared validation cases | `shared/validation-cases/*.json` | both suites | Plan rules as data, so the editor and the server can't drift apart ([its README](../../shared/validation-cases/README.md)). |
| SVG bench | `frontend/src/bench/` | a browser | The 2D performance gate ([frontend/README.md](../../frontend/README.md)). |
| Sizing bench | `deploy/measure-size.sh`, `frontend/e2e/sizing/*.sizing.ts` | workflow, by hand | What a host needs: installs the bundle, seeds offices of 1,000 and 5,000 people, and measures CPU, memory and disk idle and under the browser tests ([0120](../decisions/0120-2026-10-24-hardware-sizes.md)). Run it from Actions → sizing before changing the sizes in `deploy/install.md`. |

Running them:
```bash
cd frontend && pnpm test                         # editor core + screen tests
cd frontend && PW_CHANNEL=msedge pnpm e2e        # browser tests; needs the dev stack running
cd frontend && HSP_E2E_URL=https://localhost:8443 HSP_E2E_IGNORE_HTTPS_ERRORS=1 pnpm e2e
                                                 # against a stack from deploy/test-bundle.sh (releasing.md)
cd backend && uv run pytest                      # unit tests; database tests are skipped
cd backend && HSP_TEST_DATABASE_URL=postgresql+asyncpg://hsp:hsp@localhost:5432/hsp_test uv run pytest
```

## Test doubles: what we call them

We use the usual vocabulary ([Martin Fowler, *Test Double*](https://martinfowler.com/bliki/TestDouble.html)):

| Double | Means | Ours |
|---|---|---|
| **Stub** | Canned data or canned answers. | `frontend/src/test/stubs.ts`, `backend/tests/stubs.py` (with the `stub_admin` and `stub_viewer` builders; the API unit tests get them as the `admin`, `other_admin` and `viewer` fixtures), and the `stub_*` builders in `backend/tests/db/plan_helpers.py`. |
| **Fake** | A working, simplified implementation. | `backend/tests/fakes.py`: `InMemoryLocationsRepository`, `InMemoryPlanRepository`, and so on; `FakeIdP` in `backend/tests/unit/auth/fake_idp.py`. |
| **Spy** | Records how it was called, for the test to check afterwards. | `spyBackend` (used by `renderApp`) answers with canned replies and records every request in `calls`; `SpyRefresher` counts token refreshes. |
| **Mock** | Expects particular calls and fails the test itself if they don't come. | Not used: we check results and recorded requests instead. |

Names say which kind a thing is, and a double that does several jobs is **named after the strongest one** (mock > spy > fake > stub): `spyBackend` gives canned answers like a stub, but it also records calls, so it's a spy.
- `STUB_DESK_ITEM`, `STUB_MAYA`: one named thing in the shared world (below). Constants in capitals.
- `stubDesk(id, at, over)`, `stub_desk(ctx, ...)`: a builder with realistic defaults. It takes only what usually differs, plus `over` (`**over` in Python) for anything else.
- `stubCatalogRoutes(items)`, `stubDeviceRoutes(devices)`: the stubbed API for one area. `AS_VIEWER` signs the test in as a viewer instead of an admin.
- `InMemory…`: a fake.

## The rules

### 1. All test data is fixturized; only what's shared is shared
**No test data is defined inside a test.** A test body acts and asserts, spelling out only the values it checks; the data comes from fixtures and stubs defined outside it. Where they live depends on who uses them:
- **Used by one file** (one test or several): defined **at the top of that file**, as a module-level constant, builder or fixture, e.g. `const LOOSE = stubDevice("dev2", "DOCK-0007")`.
- **Used by more than one file:** in the shared modules: `frontend/src/test/` (`stubs.ts` for the shared world, `editorStubs.ts` for the editor's screen tests), `backend/tests/stubs.py`, or a shared `conftest.py`.
- Build values **with** the stub builders, changing only what matters (`stubDesk("d3", [5000, 1000], { allocation_mode: "bookable" })`), rather than writing whole object literals.
- Response shapes come from builders too (`page(items)`, `ref(id, name)`), so a change to the API shape is one edit.

### 2. One shared world
The stubs describe one small organisation, so tests across the app agree with each other:

> Tel Aviv HQ (s1) › Harbor Tower (b1, code HT) › Floor 3 (f3). Maya Shani (p1) in the Platform team (u1), with monitor MON-0412 (dev1) on floor f3.

Extend the world rather than inventing a parallel one: a second person is `stubPerson("p9", "Dana Cohen")`, not a new hand-written object.

### 3. Backend: setup in fixtures, the test body tests
- Setup is **pytest fixtures**: function-level by default, in a `conftest.py` next to the tests that use them, such as `tests/db/conftest.py` with `rolled_back_db_session`, `admin_editing_new_floor` and `published_floor_with_seats`.
- **A fixture's name says what it is or what it's for**, not just its type: `admin_editing_new_floor`, not `ctx`; `rolled_back_db_session`, not `db`.
- The test body **runs the code under test and asserts**. Data generation, closures and helper functions inside a test are a sign that a fixture or stub is missing.
- Parametrised data goes through a fixture too: the shared validation cases are a `case` fixture feeding `content`, `refs`, `names` and `expected`.
- **API unit tests** use `tests/unit/conftest.py`: `api` is a test client of the app that sends the CSRF header, signed in as `signed_in.principal` (the `admin` fixture until the test sets another user, e.g. `signed_in.principal = viewer`; `other_admin` is a second admin). `api_without_csrf` is the same app without the header, for tests that check the refusal. `locations_repo` plugs in an empty in-memory locations store; create sites, buildings and floors through the API with `create_site`, `create_building` and `create_floor` (`tests/unit/api_helpers.py`) rather than writing rows into a fake.
- **Unit tests have no database**, so the autouse fixture `no_database_at_startup` (`tests/unit/conftest.py`) skips the app's schema check at startup ([0109](../decisions/0109-2026-10-23-schema-check-everywhere.md)).
- **Split test files by area** (for example drafts → `test_versions.py`, `test_guards.py`, `test_rules.py`; the changeset engine → `tests/unit/changeset/`; sign-in → `tests/unit/auth/`), so a failure's file name already says what broke.

### 4. Frontend screen tests
- Render **the whole app** at a path with `renderApp(path, routes)`. Give it only the routes the screen needs, built with the `stub…Routes` helpers.
- Find things **the way a user would**: by role and accessible name (`getByRole("button", { name: "Make a copy" })`), not by CSS class or test id. For the plan, the drawing is `svg[data-lod]`; click and drag on it at plan coordinates with `clickOnPlan` and `dragOnPlan` (`src/test/planPointer.ts`).
- **Check what was sent** through `calls` (the spy) or a route function that captures the request body.
- **Never assume timing.** Searches apply after a short pause and requests resolve later: wait for the state you need (`waitFor`, `findBy…`) before the next step. A test that passes on your machine but not in CI usually missed one of these waits.
- Opt into jsdom with `// @vitest-environment jsdom` as the file's first line. Clean up after each test, and reset the language if the test changed it:
  ```ts
  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    await act(() => i18n.changeLanguage("en"));
  });
  ```
- Where wording matters, check **both languages**.

### 5. Editor core tests
Use `editing()` from `editor/core/testPlan.ts`. It loads a small plan (an L of two walls, a door, desk d1 with monitor m1) into a store at 1 px = 10 mm and gives you `click`, `drag` and `at` in plan millimetres. Build other plans from the same stubs (`stubPlan`, `stubWall`, `stubDesk`, `stubScreen`…).

### 6. Database tests
- Every test runs inside a transaction that is rolled back, so tests don't see each other's data. The schema is rebuilt with Alembic once per run, which also tests the migrations.
- **Any new constraint, trigger or non-trivial query needs a database test** ([0061](../decisions/0061-2026-10-08-test-strategy.md)).
- Floors, locks and plan changes come from `tests/db/plan_helpers.py` (`context`, `apply`, `publish_by_hand`, `stub_wall`, `stub_door`, `stub_desk`, `stub_zone`).

### 7. Plan rules are shared cases first
A plan rule (an error or a warning) is changed by **editing the cases** in `shared/validation-cases/` first. Both the TypeScript checker and the server's `validate` must then pass them.

### 8. Browser tests stay few
Only key flows (signing in and finding a seat; drawing and publishing a floor), plus one check that the pages break no Content Security Policy rule. That check proves something only against `hsp-web`, as in the release workflow: the dev server sends no policy, so there it always passes. Each test **creates its own data through the API and archives it afterwards**, so it runs against any dev database.

## Review checklist
- Is any test data defined inside a test body? It belongs at the top of the file, or in the shared stubs.
- Is data used by more than one file shared, and data used by one file kept in that file?
- Is a double named after its strongest role (mock > spy > fake > stub)?
- Python: is setup in fixtures, with the test body only acting and asserting? Does each fixture's name say what it is? Is the file about one area?
- Screen tests: queried by role and name? Waits for state, not for time? Both languages where text matters?
- New database constraint or query: is there a database test?
- New or changed plan rule: are the shared cases updated?
