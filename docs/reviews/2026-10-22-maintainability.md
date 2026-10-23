# Maintainability review, October 2026

- **Date:** 2026-10-22
- **Code reviewed:** commit `3e3a3ec`, the top of the v1 stack (#99–#112). The demo follow-ups (#113–#120) are not included.
- **Questions asked by the owner:** How coupled are the parts of the code? How locked in are we to our vendors, for example Keycloak and PostgreSQL? How easy is it to add a screen or an endpoint? How well are we tested?

All numbers below were measured on that commit. Coverage counts lines and branches together for Python, and statements for TypeScript.

## Summary

| Question | Short answer |
|---|---|
| [Coupling](#1-coupling) | **Low to medium.** The layers are clear and depend one way. Two spots are tighter than they need to be: some backend services write their own SQL, and the floor pages and the editor import each other. |
| [Vendor lock-in](#2-vendor-lock-in) | **Keycloak: low in the code, medium in operations.** HSP speaks plain OIDC, but it makes three assumptions only Keycloak meets. **PostgreSQL: high, by design.** Another PostgreSQL host is easy. Another database engine would take weeks. |
| [Adding features](#3-adding-features) | **Easy for screens and endpoints.** CI catches most forgotten steps. The floor editor is the hard part. |
| [Tests](#4-tests) | **Good unit coverage, thin end-to-end coverage.** Backend 93%, frontend 87%, backup 94%. But nine routers' handlers never run in a backend test, and the browser tests only run when a release is made. |

### What we recommend, most valuable first

| # | Change | Why | Size |
|---|---|---|---|
| 1 | Run the browser tests on every PR, or at least every night on `main` | Today a PR that breaks a user flow is found only when we cut a release ([4.3](#43-end-to-end-tests)) | Small to medium |
| 2 | Add HTTP tests for the nine routers no backend test calls, and build the admin-only route list from the app instead of by hand | A route that forgets its permission check would pass every test ([4.1](#41-backend)) | Medium |
| 3 | Make the role claim and the session length work with any OIDC provider | 0008 promises customers can use their own identity provider. Today only Keycloak fully works ([2.1](#21-keycloak)) | Small |
| 4 | ~~Decide whether backend services may query the database directly~~ **Decided:** the queries move into repositories, as their own PR stack after 1.2 ([0110](../decisions/0110-2026-10-22-repositories-after-1-2.md)) | The code does both. The decisions say only one ([1.1](#11-backend)) | Large, scheduled |
| 5 | Show coverage in CI, without a minimum | So a drop is visible in the PR that caused it ([4.4](#44-coverage-in-ci)) | Small |
| 6 | Bring the backend and frontend READMEs up to date | They name Python 3.13 and list a third of the packages ([5](#5-other-observations)) | Small |

Each of these is a proposal. If we take one up, it gets a decision record. The owner also wants the dev cycle and CI times improved, alongside the repositories stack ([0112](../decisions/0112-2026-10-23-dev-cycle-and-ci-times.md)). Two deeper reviews follow from this one: [dependencies](2026-10-22-dependencies.md) and [decision records](2026-10-22-decision-records.md). Each has its own recommendations.

## 1. Coupling

### 1.1 Backend

The backend is split into packages by area. Each depends only on the packages to its right:

```
api (HTTP: routers and Pydantic models)
  → domain: locations, plans, org, seats, catalog, imports
      → shared: auth, audit, problems, release
          → models, db, config
```

- There are **no cycles** between the domain packages. `org` uses `seats` (deactivating a person frees their seat) and `imports`. `seats` uses `imports`. Neither imports the other back.
- The domain packages don't import FastAPI, so the business rules don't depend on the web framework. Two small exceptions: `audit.py` uses FastAPI's JSON encoder, and services raise `Problem` errors that carry an HTTP status. That second one is a deliberate choice ([0037](../decisions/0037-2026-10-08-api-errors.md)). It keeps errors simple, at the price of the services knowing about HTTP.
- Monitoring is kept to the edges. Request logs, metrics and tracing live in `main.py`, `metrics.py`, `tracing.py` and `db.py`, and no feature code calls them.

**Tighter than planned: two ways to write a service.** [0014](../decisions/0014-2026-10-08-persistence-layer.md) sets three layers: routers, then services, then repositories that hold the SQL. [0061](../decisions/0061-2026-10-08-test-strategy.md) relies on this: services are tested against in-memory repositories, with no database. Only part of the code works that way:

| Pattern | Areas | Tested by |
|---|---|---|
| Service + repository | locations (sites, buildings, floors), plan reads, sign-in sessions | Unit tests with `InMemory*` fakes, plus DB tests for the repository |
| Service writes its own SQL | five areas: org (units, people, imports), seats (assignments, occupancy, search, batch, imports), catalog (items, devices), plan drafts, publishing and locks, and preferences | DB tests only |

`tenancy.py` also runs a query, but it is a single lookup of the one default tenant, with no rules in it. [0110](../decisions/0110-2026-10-22-repositories-after-1-2.md) lists each module and what is left out.

For example, `org/units.py` makes 44 queries itself. Without the database, unit tests cover only 7–35% of the org and seats code. With the DB tests it is 82–99%, so the code is tested, just not the way the decisions describe.

Both patterns work. The problem is that a developer can't tell which one a new feature should follow. We see two ways out:
- **Accept both, and record when to use which.** For example: a repository when the logic is worth testing without a database, direct queries otherwise. This is cheap. The DB tests take about 13 seconds.
- **Move the SQL into repositories** for the five areas in the table. This would take weeks, and the gain is faster tests for code that is already tested.

We recommended the first. **The owner chose the second, but not now:** the SQL moves into repositories as its own PR stack, after AD sync (1.1) and Kubernetes (1.2). Until then, new code follows the area it's in, and new areas start with a repository ([0110](../decisions/0110-2026-10-22-repositories-after-1-2.md)).

**Tenant scoping is written into each query by hand** (`tenant_id == …`, 11 times in `org/units.py` alone). v1 has one tenant, so this costs nothing today. If more tenants come ([0003](../decisions/0003-2026-10-07-tenancy-model.md)), one forgotten filter would leak data between them. That would be the time to scope tenants centrally, for example with a session-level filter.

### 1.2 Frontend

The frontend is split into feature folders (`people/`, `org/`, `seats/`, `devices/`, `catalog/`, `floors/`, `editor/`, `imports/`). They all share `api/`, `app/`, `auth/`, `components/`, `i18n/` and `lib/`. Few features import each other:

```
devices → people, seats      people → org      seats → org
floors ⇄ editor   (both ways)
```

- **The editor core is cleanly separated.** `editor/core` holds the tools, snapping, undo and plan rules, with no React or DOM code, and ESLint enforces that ([0052](../decisions/0052-2026-10-08-svg-commitment-and-performance-gate.md)). This is the best-protected boundary in the code. One small leak: `operations.ts` and `fromApi.ts` use the API's generated types, so a change to the API's plan format reaches the core. `fromApi.ts` is meant to be the only adapter.
- **`floors` and `editor` import each other.** The floor page uses the editor's plan view, which is fine. But the editor also takes its data queries from `floors/planData.ts`, and a hook from `floors/EditFloorButton.tsx`. Moving the shared plan queries and the lock hook into a neutral folder (for example `src/plans/`) would make the dependency one-way. This is a small change.
- **Server data and editor state are kept apart.** Server data lives in TanStack Query and editor state in the Zustand store ([0066](../decisions/0066-2026-10-08-frontend-state-and-ui-components.md)), so a screen can't silently change the editor's undo history.

### 1.3 Backend and frontend together

The API contract is the only thing the two sides share, and both sides check it. The backend's OpenAPI file and the frontend's generated types (`schema.d.ts`) are committed, and CI fails if either is stale. A renamed field becomes a TypeScript error in every screen that uses it. Plan rules shared by both sides are written once as data in `shared/validation-cases/` and run by both test suites ([0051](../decisions/0051-2026-10-08-validation-feedback.md)).

## 2. Vendor lock-in

### 2.1 Keycloak

[0008](../decisions/0008-2026-10-07-identity-provider.md) chose to bundle Keycloak, but said HSP "only speaks OIDC", so customers could point it at their own identity provider (Entra ID, Okta and others). The code mostly keeps that promise. Login uses Authlib with standard OIDC discovery, and logout uses the standard revocation and end-session endpoints. The frontend never talks to Keycloak.

**Three assumptions only Keycloak meets:**

| Assumption | Where | What happens with another provider |
|---|---|---|
| Roles are in the `realm_access.roles` claim | `auth/principal.py:45` | Nobody gets `hsp-admin`. Entra ID puts app roles in `roles`, and Okta usually in `groups`. |
| The session lasts as long as `refresh_expires_in` says | `auth/oidc.py:64` | Only Keycloak sends this field. Without it, a session ends when the access token does, often 5–60 minutes, so users are sent back through sign-in that often. |
| The access token is a JWT that HSP can read | `auth/principal.py:28` | Providers whose access tokens are opaque (Google, for example) can't sign anyone in. |

**Identity is keyed on the provider's user ID** (the `sub` claim) in five places: sessions, user preferences (`user_profile`), the audit log's `actor_subject`, the floor edit lock's holder, and `person.idp_subject`. A new identity provider gives every user a new ID. Their preferences and their link to a person record would be lost, and old audit entries would point to IDs nobody has. Moving would need a one-off mapping, for example by email.

**In operations, Keycloak is built in:** a service in the production compose file, its own image and realm export in `deploy/keycloak/`, `hsp install` creating the first admin with Keycloak's `kcadm.sh`, every backup holding Keycloak's database, and the smoke, restore and upgrade tests starting it.

**Estimate:**
- *Letting a customer use their own provider* (what 0008 promises): about a day in the backend to make the role claim and the session length configurable. Then a few days to make the Keycloak service optional in the compose file, `hsp install`, backups and `install.md`.
- *Replacing the bundled Keycloak with another product:* mostly operations work, about one to two weeks. Existing installations would also need the user-ID mapping above.

### 2.2 PostgreSQL and PostGIS

[0012](../decisions/0012-2026-10-08-database.md) chose PostgreSQL with PostGIS as the only database, and the code uses it deeply, on purpose:

| PostgreSQL feature | Used for |
|---|---|
| PostGIS geometry columns, GiST indexes, whole-millimetre `CHECK` constraints | Every wall, zone, column and placed item ([0029](../decisions/0029-2026-10-08-geometry-representation.md)) |
| An exclusion constraint on version ranges (`btree_gist`, `int4range`) | The heart of plan versioning: no two versions of an element can overlap ([0028](../decisions/0028-2026-10-08-floor-version-storage.md)) |
| Partial unique indexes (3) | One draft per floor, one root org unit, one primary team per person |
| `JSONB` and `ARRAY` columns | Audit before/after, user preferences, catalog attachment rules |
| `INSERT … ON CONFLICT`, `SELECT … FOR UPDATE` | Edit locks and drafts |
| asyncpg, `pg_dump` / `pg_restore` | The driver, and the whole backup program ([0106](../decisions/0106-2026-10-21-backups.md)) |

One thing helps portability. **Geometry calculations run in Python** (Shapely, in `plans/geometry_checks.py`), not in SQL. No query calls a PostGIS function. PostGIS stores the shapes and enforces the rules, but HSP doesn't depend on its spatial queries.

**Estimate:**
- *Another PostgreSQL* (a managed service such as Amazon RDS, Azure or Cloud SQL, with PostGIS): change the connection settings. The backup program needs `pg_dump` access, which these services allow. **Easy.**
- *Another database engine* (SQL Server, MySQL): rewrite the initial migration, move the version-range rule from the database into the code, replace geometry storage, JSONB, arrays and upserts, and rewrite the backup program. **Several weeks.** We see no reason to plan for this.

### 2.3 Everything else

| Area | Choice | Lock-in |
|---|---|---|
| Backend framework | FastAPI, SQLAlchemy, Pydantic | Normal framework lock-in. The domain packages don't import FastAPI, which would make a change of web framework easier. |
| Frontend | React, TanStack Query and Router, Zustand, Radix/shadcn, Tailwind | Normal framework lock-in. shadcn components are copied into `components/ui`, so we own them. The plan renderer can be swapped because the editor core is headless ([0052](../decisions/0052-2026-10-08-svg-commitment-and-performance-gate.md)). |
| Backups | Any S3-compatible store, or a folder | None. |
| Monitoring | Prometheus metrics, OpenTelemetry traces, JSON logs | None. All three are open standards. |
| Code hosting and CI | GitHub, GitHub Actions, `gh stack` | Medium. The workflows (about 700 lines) and the stacked-PR process are GitHub-specific ([0053](../decisions/0053-2026-10-08-code-hosting-and-ci.md), [0093](../decisions/0093-2026-10-16-github-stacked-prs.md)). |

## 3. Adding features

### 3.1 A backend endpoint

The 85 endpoints follow one shape (`api/sites.py` is a good example to copy):

1. Pydantic models for the request and reply, and a handler, in `api/<area>.py`.
2. The logic in a service in the area's package (and a repository method, if the area has a repository).
3. A new router is added to `api/v1.py`.
4. A table change: a model in `models/`, then `alembic revision --autogenerate`, reviewed by hand, plus a DB test ([0061](../decisions/0061-2026-10-08-test-strategy.md)).
5. `uv run hsp-export-openapi openapi.json`, then `pnpm api:types`. CI fails if either is forgotten.
6. Tests: unit tests with fakes, or DB tests.

Much comes for free: sign-in (`CurrentPrincipal`), admin and CSRF checks (`dependencies=WRITE`), error replies in one format ([0037](../decisions/0037-2026-10-08-api-errors.md)), cursor pagination, audit records, and request logs, metrics and traces.

**Friction:**
- Each router repeats about 10 lines of setup (`get_service`, the `Service` alias, `to_out`). This is readable, and not worth abstracting.
- A developer has to guess which of the two service patterns to follow ([1.1](#11-backend)).
- Nothing reminds you to add a new write route to the hand-written list in `test_write_access.py` ([4.1](#41-backend)).

### 3.2 A screen in the UI

1. A `data.ts` with queries and mutations through the typed `api` client (`devices/data.ts` is a good example). A wrong path or field name is a type error.
2. The page component, its route in `routes.tsx`, and its link in `app/Sidebar.tsx`.
3. Its texts in `i18n/en.json` and `i18n/he.json`. A test fails if a key is missing from one language or is empty.
4. A screen test with `renderApp` and `spyBackend` ([testing guide](../guides/testing.md)).

Ready-made parts: the shadcn components, the page shell, Problem-Details error display, and the shared stub data for tests.

**Friction:**
- **The floor editor is where changes get hard.** `PlanView.tsx` (636 lines), `interaction.ts` (434) and `store.ts` (428) carry most of the editor's behaviour, and the demo follow-ups add to all three. A change to a gesture often touches the core, the overlay and the view together.
- The frontend README's layout lists 4 of 16 folders, so a newcomer has to find the feature-folder pattern on their own.

**Verdict:** a list-and-panel screen or a CRUD endpoint is about a day's work with tests. Editor features take noticeably longer.

## 4. Tests

| Suite | Tests | Coverage |
|---|---|---|
| Backend, unit tests only | 200 | 62% |
| Backend, unit + DB tests | 275 | **93%** |
| Backup program | 72 | **94%** |
| Frontend (Vitest) | 275, in 47 files | **87%** of statements, 77% of branches |
| Browser (Playwright) | 3 flows, a check of every page for CSP errors, and the restore drill | not measured |

### 4.1 Backend

The domain code is well covered: plans 90–100%, seats 88–99%, org 82–90%, catalog 95%.

**The gap is the HTTP layer.** A *handler* is the function in `api/*.py` that receives one request. It reads the URL, the query and the body, calls the service, and turns the answer into the reply. It holds no business rules, but it is where a request's details are passed on.

The handlers of **nine routers never run in any backend test**: catalog, devices, drafts, imports, occupancy, org units, people, preferences and seats (68–81% coverage, and the missing lines are exactly the handler bodies). Their services are tested by calling them directly, so the rules are checked. What isn't checked is the step in between: that what arrives in the request reaches the service, and that the reply has the right status and shape.

An example. The seat search handler (`api/seats.py`, `search_seats`) takes seven filters from the URL and passes each one to the search service. Suppose a change drops `building_id` on the way:
- The service tests still pass, because they call the service directly with `building_id`.
- The frontend tests still pass, because they answer from `spyBackend`, not the real backend.
- The browser test still passes, because it searches by name only.

Then "seats in Harbor Tower" would silently return every seat, and no test would fail. Locations and plans don't have this gap: their API tests (`test_sites_api.py` and others) send real requests to the app, with fake repositories behind it. The same kind of test for the nine routers would close it, with the service replaced by a stub where the area has no repository. That's about one test file per router.

**Permission checks rely on a hand-written list.** `test_write_access.py` checks that 28 write routes refuse viewers and requests without a CSRF token. A new route isn't on that list until someone adds it. A route that forgot `dependencies=WRITE` would let any signed-in user change data, and every test would still pass. Building the list from the app's own routes (every route that isn't GET, apart from sign-in) would close this for good.

### 4.2 Frontend

Most screens are at 80–95%. The weakest parts:

| Part | Coverage | Not tested |
|---|---|---|
| `org/panel/Positions.tsx` | 29% | Adding, editing and removing positions |
| `org/OrgChart.tsx` | 60% | Most of the chart's interactions |
| `editor/view-svg/EditOverlay.tsx` | 67% | Drag previews and handles |
| `editor/clipboardActions.ts` | 61% | Paste edge cases |
| `floors/LocationAdmin.tsx` | 70% | Error and archive paths |
| `seats/` | 76% | |

Branch coverage (77%) is lower than statement coverage. Error paths and edge cases are tested less than the main path.

### 4.3 End-to-end tests

**What the browser tests cover:** signing in; drawing a room, placing and labelling a desk, and publishing; finding where someone sits and opening the seat on the plan; every page loading without a content-security error; and a backup restored into a fresh database ([0106](../decisions/0106-2026-10-21-backups.md)).

**What they don't cover:** assigning a seat through the UI (the test seeds it through the API), editing people and the org chart, imports, the catalog and devices, archiving and restoring, two admins and the edit lock, a read-only user, Hebrew (right to left), and signing out.

[0061](../decisions/0061-2026-10-08-test-strategy.md) asked for "a small smoke suite", so a short list is expected. **The bigger problem is when they run.** The browser tests run in the release workflow, which starts on a version tag, by hand, or on PRs that change the release scripts. The restore drill runs weekly and on PRs that change backups. **A normal frontend or backend PR never runs them.** A PR that breaks signing in or publishing is found only when a release is cut, and by then several PRs may have merged on top of it. They don't run in PR CI because it has no Keycloak. [0077](../decisions/0077-2026-10-08-login-implementation.md) said to revisit that "if this bites".

#### What running them in CI would cost

Measured on the release run for #110 (GitHub's standard Linux runner):

| Step | Time |
|---|---|
| Build the four images (with the build cache) | 1 min 17 s |
| Pack and upload the bundle, then download it in the test job | about 1 min 40 s |
| Install the bundle and wait for a healthy stack | 1 min 29 s |
| Install Playwright and Chromium, and run the browser tests | 44 s |

PR CI takes 3 to 7 minutes today. Its slowest job is usually `images`, which already builds the images (1 min 31 s) and starts them for a smoke test (1 min). The repository is public, so GitHub's standard runners cost nothing. The stack peaks at about 1.2 GB of memory ([install.md](../../deploy/install.md)), well inside a runner's 16 GB.

#### The options

| Option | Extra time per PR | What it tests | Trade-off |
|---|---|---|---|
| **A. Add the browser tests to the `images` job.** After the smoke test, start the stack from the images it just built, then run Playwright. | About 2–2.5 minutes, on the job that already finishes last. PR CI goes to roughly 5–9 minutes. | The images we ship: nginx, the security headers, the production Keycloak realm | Slower PRs. It runs on every PR that changes code. |
| **B. A separate job against the dev stack** (`compose.dev.yml`, the API under uvicorn, the frontend under Vite) | Little: it runs beside the other jobs and takes 3–4 minutes | The app's behaviour, but not the shipped images, nginx or the security headers | A second way of starting HSP to keep working. |
| **C. Every night on `main`**, the release workflow's build and test jobs on a schedule | None | The shipped bundle, as now | A break is found the next morning, after the PR has merged. |
| **D. As now**, on release tags and release-script PRs only | None | The shipped bundle | A break is found at release time. |

**We recommend A**, made part of `ci-ok` so it blocks a merge. It tests what customers run, and two to three minutes per PR is a fair price for that. C is the cheap fallback if PR times start to hurt.

**First, the tests have to stop failing at random.** The release runs from the last push failed on three PRs in this stack (#107, #108, #112). Two failed because a script called Keycloak while it was still starting, which got a 503. The third failed an assertion in `find-a-seat`. If such a test blocks merges, it will block them at random. So the waits should be fixed first, and the test run a few times in a row to show it's stable. Only then should it become a required check.

After that, add flows a few at a time, starting with assigning a seat and the edit lock.

### 4.4 Coverage in CI

CI doesn't measure coverage. The numbers above needed `pytest-cov` and `@vitest/coverage-v8`, which aren't project dependencies. We recommend adding both and printing coverage in the CI summary, with no minimum, so that a drop shows up in the PR that caused it. A minimum tends to produce tests written for the number.

## 5. Other observations

These are small, and noted so they aren't lost:
- **The READMEs are out of date.** `backend/README.md` says uv installs Python 3.13 (it is 3.14, [0091](../decisions/0091-2026-10-15-python-3-14.md)). Its layout lists 6 of about 20 packages. `frontend/README.md` lists 4 of 16 folders.
- **The largest backend modules** are `plans/drafts.py` (546 lines), `org/units.py` (513), `plans/changeset.py` (476) and `plans/publishing.py` (430). They are long but each is about one thing. No action needed yet.
- **Nothing enforces the backend's layers.** The frontend's ESLint rule protects the editor core. The backend has no equivalent, so a domain package could start importing `api/` and no check would notice. A tool such as import-linter could hold the layers in section 1.1 in about 20 lines of config.
- **`deploy/bin/hsp` is a 694-line Bash script.** shellcheck checks it, and the release workflow tests install, upgrade and restore end to end. At its current size that is enough. If it keeps growing, consider moving it to Python, like the backup program.

## 6. Deeper looks

The owner asked for two deeper looks, now written up separately:
- **Dependency health:** [dependencies review](2026-10-22-dependencies.md).
- **The decision log itself:** [decision records review](2026-10-22-decision-records.md).

These might also be worth a deeper look. None was done, and each waits for the owner's go-ahead:
- **Performance as data grows:** query counts per page (N+1 queries), missing indexes, and the plan editor with large floors after the demo changes.
- **Security review** of the sign-in flow, CSRF, imports (Excel files) and the operator CLI.
- **Database migrations:** the first migration is 1,170 lines. Should it be squashed or tested further before 1.0?
- **Frontend bundle size and load time.**
