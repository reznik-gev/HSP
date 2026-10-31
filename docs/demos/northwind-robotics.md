# Demo: Northwind Robotics

A live walkthrough of HSP for a prospective client, about 20 minutes ([0103](../decisions/0103-2026-10-19-demo.md)). You run HSP on your own machine, with a made-up company already in it. This page has the setup and a script: what to click, and what to say, feature by feature.

**The story:** Northwind Robotics has 44 people in 12 teams, an office in Tel Aviv (Harbor Tower, floors 3–5) and a hardware lab in Haifa. **Dana Levin**, the office manager, runs HSP. **Sam Carter**, a frontend engineer, only looks things up.

## Before the demo (once, about 10 minutes)
You need Docker Desktop running, and the repo set up for development (the [main README](../../README.md)'s quick start). Use three terminals, all from the repo root, in Git Bash.

1. **The dev stack** (PostgreSQL and Keycloak):
   ```bash
   docker compose -f deploy/compose.dev.yml up -d
   ```
2. **The demo database, the first time only.** The API checks the database's schema when it starts, and stops if the database is empty ([0109](../decisions/0109-2026-10-23-schema-check-everywhere.md)). So before its first start, create `hsp_demo` and bring it up to date:
   ```bash
   docker compose -f deploy/compose.dev.yml exec postgres psql -U hsp -d hsp -c "CREATE DATABASE hsp_demo"
   cd backend
   HSP_DATABASE_URL=postgresql+asyncpg://hsp:hsp@localhost:5432/hsp_demo uv run alembic upgrade head
   ```
   If `CREATE DATABASE` says `hsp_demo` already exists, skip this step.
3. **The API, on the demo database** (terminal 1; leave it running):
   ```bash
   cd backend
   HSP_DATABASE_URL=postgresql+asyncpg://hsp:hsp@localhost:5432/hsp_demo \
     uv run uvicorn hsp.main:create_app --factory --port 8000
   ```
   If it stops at once with `the database schema is at no revision`, step 2 is missing.
4. **The app** (terminal 2; leave it running):
   ```bash
   cd frontend && pnpm dev
   ```
5. **Fill in Northwind Robotics** (terminal 3). It rebuilds the `hsp_demo` database from scratch, so it's safe to run again before each demo, with the API still running:
   ```bash
   cd backend && uv run python ../deploy/demo/seed.py
   ```
   It ends with `Ready: open http://localhost:5173 ...`. If it says the API isn't using the demo database, step 3 is missing its `HSP_DATABASE_URL`.
6. **Check it:** open <http://localhost:5173>, sign in as `dana.levin` / `demo`, and open Floors. Then use the browser in full screen, at 100% zoom.

Your development database is never touched: the demo lives in its own `hsp_demo` database, and the seed refuses to run if the API is on any other.

| Sign in as | Password | Who |
|---|---|---|
| `dana.levin` | `demo` | Office manager, an **admin**: can change everything |
| `sam.carter` | `demo` | An engineer: can look, not change |

## The script

### 1. Where does everyone sit? (3 min)
*Sign in as Dana. Open **Floors**.*

![The Floors page](images/floors.png)

- "Every site, building and floor, with how full each one is." Point at **Taken**, **Free** and **Occupancy**.
- Floor 5 is empty: "a floor you've added but not drawn yet."
- **Open Floor 3.** "Each desk is coloured by what it's for: assigned to someone, reserved for a team, free, bookable or unavailable." Point at the legend.

![Floor 3](images/floor-plan.png)

- Click a desk: the panel shows who sits there and their team.
- **Search:** press `/`, type `Maya` and press Enter, then **Show on plan**. "Anyone can find a colleague in two clicks."

![Maya's seat, shown on the plan](images/show-on-plan.png)

### 2. Two languages (1 min)
*Click the translate icon at the top.*

![The same floor in Hebrew](images/hebrew.png)

- "HSP is fully in Hebrew, right to left." The menus and panels move to the other side.
- "The plan itself doesn't flip. North stays up, so the drawing still matches the building."
- Switch back to English. Optionally show the theme button next to it, for dark mode.

### 3. People and teams (3 min)
- **People:** filter by a team, then tick **Without a seat**. "Who still needs a desk?"
- **Teams:** the org chart, from the company down to its teams.
- **Imports → People:** drop [`deploy/demo/new-hires.csv`](../../deploy/demo/new-hires.csv) on the page. It shows a preview first, **3 people will be created**, and nothing changes yet. Choose **Apply import**. "People and teams come from CSV or Excel, so an HR export is enough."

### 4. Giving someone a seat (2 min)
- Open **Floor 3** and click **HT-3-19**, a free desk in the Vision pod. Choose **Assign**, type `Ava`, and pick **Ava Thompson**, a new hire. The notice at the bottom has an **Undo**.
- Click **HT-3-17**, a desk reserved for the Vision team: "kept for the team, for whoever joins next."
- Back on **Floors**, Floor 3's numbers have changed.

### 5. Drawing and changing a floor (5 min)
*Open **Floor 4** and choose **Edit floor**.*

![The editor](images/editor.png)

- "Floor 4 has a draft in progress." Someone renamed the Sales pod and added a plant, and nobody else sees it until it's published. "Only one person edits a floor at a time. Others see who's editing."
- Choose **Place item** in the tools on the left. The catalog opens on the right: pick **Desk 160 × 80**, then click the empty space right of the core to place it (R turns it). Its measurements are exact, to the centimetre.
- The **Problems** tab now shows **1**: "This seat has no label yet." "HSP checks the plan as you draw." Select the desk, type a **Seat label**, `HT-4-33`, in **Properties**, and the problem goes away.
- **Undo** and **Redo** are at the top. **Number seats** (in the tools) labels a whole row of desks in one go.
- **Publish.** The dialog lists what changed (the new desk, the renamed zone) and takes a note for the history. The new layout is live for everyone.
- The history button at the top lists every published version. An older one can be restored as a draft.
- Optional: **Raised** and **Floor** at the bottom show only what's on the floor, or what's mounted higher, such as the boardroom display.

### 6. Catalog and devices (2 min)
- **Catalog:** the furniture and equipment that plans are drawn from, with real sizes. Your own items can be added.
- **Devices:** monitors and printers by asset tag. Filter **Issued to someone** for the laptops given to people, or **Not placed** for the spare monitors in the storeroom. **Show on plan** jumps to a device's desk.

### 7. What everyone else sees (1 min)
*Open the user menu (top corner), **Sign out**, and sign in as `sam.carter`.*
- Sam can browse floors and search, but there's no **Edit floor** and nothing to change. "Admins change things; everyone else looks things up."

### 8. Running it (talk, 2 min)
- "HSP runs on your own server, even with no internet: one download with everything in it."
- "Sign-in is Keycloak, which can use your company's existing logins (LDAP or Active Directory)."
- "It serves HTTPS itself, or runs behind your own proxy."

## Honest answers to likely questions
- **Booking a desk for a day?** Not yet. Bookable desks are marked today; booking them comes in a later version ([0025](../decisions/0025-2026-10-08-v1-scope.md)).
- **3D?** Planned after the first release. Heights are shown in 2D for now ([0094](../decisions/0094-2026-10-16-3d-view-after-v1.md)).
- **Syncing people from Active Directory?** Later. For now, imports from CSV or Excel, matched by employee number, so a later sync can take over the same records ([0027](../decisions/0027-2026-10-08-v1-interim-people-and-access.md)).
- **Team managers editing their own areas?** Later. In the first version, admins edit, and everyone else views.
- **Phones and tablets?** Desktop browsers only, for now ([0087](../decisions/0087-2026-10-13-frontend-delivery-plan.md)).
- **When can we install it?** The product features are done. Installing, upgrading and backups are being finished before the first release.

## After the demo
Run the seed again (step 5) to put everything back as it was. To stop, press Ctrl+C in the API and app terminals, then run `docker compose -f deploy/compose.dev.yml stop`.
