# 0150 — Rename the product from HSP to Musical Chairs

- **Date:** 2026-11-21
- **Status:** Accepted
- **Refines:** [0072](0072-2026-10-08-rename-hsm-to-hsp.md) (the product's name)
- **Refined by:** [0152](0152-2026-11-22-keycloak-realm-name-and-file-names.md) (the realm's name, file names and the browser tab title)

## Context
The product is named **HSP, "Human-Space Program"** ([0072](0072-2026-10-08-rename-hsm-to-hsp.md)). The owner prefers **Musical Chairs**. The name fits what the product does: people and teams move between seats.

There are no releases, tags or installs yet. So no server has to move its paths, settings or data, and renaming now is as cheap as it will ever be. It is still big: on 2026-11-21, 349 of 711 tracked files mention HSP, about 2,560 times. The HSM → HSP rename changed 35 files.

[0126](0126-2026-11-08-what-may-change-in-an-accepted-record.md) allows renames in accepted records with the owner's explicit yes, and says a big rename gets a record of its own. This is that record.

## Options considered
**How the name is written in code:**
- **`musical_chairs`** ✅
- `mc`: short, but on Linux servers `mc` is already Midnight Commander and the MinIO client, and Midnight Commander sets `MC_*` environment variables.
- `musicalchairs`: no clashes, but harder to read.

**Scope:**
- **Everything, including code, configuration and file names** ✅, as in 0072.
- User-facing text and docs only: leaves two names side by side for good.

**Decision records:**
- **Rewrite in place, plus this record** ✅, as in 0072.
- Leave the old records saying HSP: every reader has to translate old names.

**When:**
- **After every PR open on 2026-11-21 has merged** ✅ (#176, #178, #179, #180), so none of them has to be rebased across the rename.
- Now: each open PR would conflict in many files.

## Decision
- **The product's name is Musical Chairs.** *(The owner's choice)*
  - **In the UI:** "Musical Chairs". In Hebrew: **כיסאות מוזיקליים**. *(The owner's choice)*
  - **"MC" is its short form.** *(The owner's choice)* It shows only in the sidebar's name spot, where "HSP" shows today, with the full name on hover. Hebrew keeps the Latin "MC". Everywhere else, including the browser tab title, the version line and messages, uses the full name in the reader's language. *(Claude's choice)*
  - **In git and on GitHub:** `MusicalChairs`. The repository becomes `reznik-gev/MusicalChairs`. *(The owner's choice)*
  - **In code:** `musical_chairs`. *(The owner's choice)*
- **Everything is renamed:** code, configuration, file and folder names, docs, guides, skills, the CHANGELOG, and the user-guide images. *(The owner's choice)*
- **How each old name changes:** *(Claude's choice)*
  - `hsp_x` and `HSP_X` become `musical_chairs_x` and `MUSICAL_CHAIRS_X`. `Hsp` in a class name becomes `MusicalChairs`, and `hspX` in camelCase becomes `musicalChairsX` (so `__hspBench` becomes `__musicalChairsBench`).
  - `hsp-x` becomes `musical-chairs-x`.
  - Plain `hsp` becomes `musical_chairs`, except in a host name and in a command people type, which become `musical-chairs`. Host names can't contain `_`. Commands follow the scripts, which already use `-`.

  | Before | After |
  |---|---|
  | Python packages `hsp`, `hsp_backup`; projects `hsp`, `hsp-backup` | `musical_chairs`, `musical_chairs_backup`; `musical_chairs`, `musical-chairs-backup` |
  | Scripts `hsp-api`, `hsp-export-openapi`, `hsp-backup` | `musical-chairs-api`, `musical-chairs-export-openapi`, `musical-chairs-backup` |
  | Class `HspBackup` | `MusicalChairsBackup` |
  | Environment variables `HSP_*`, `VITE_HSP_VERSION` | `MUSICAL_CHAIRS_*`, `VITE_MUSICAL_CHAIRS_VERSION` |
  | Operator CLI `bin/hsp`, bundle `hsp-<version>.tar.gz` | `bin/musical-chairs`, `musical-chairs-<version>.tar.gz` |
  | Server paths `/opt/hsp`, `/etc/hsp`, `/var/lib/hsp`, `/etc/nginx/hsp` | `/opt/musical_chairs`, `/etc/musical_chairs`, `/var/lib/musical_chairs`, `/etc/nginx/musical_chairs` |
  | Images `hsp-api`, `hsp-web`, `hsp-keycloak`, `hsp-backup` | `musical-chairs-api`, `musical-chairs-web`, `musical-chairs-keycloak`, `musical-chairs-backup` |
  | Compose projects `hsp-dev`, `hsp-demo` | `musical-chairs-dev`, `musical-chairs-demo` |
  | Databases `hsp`, `hsp_test`, `hsp_demo` and DB user `hsp` | `musical_chairs`, `musical_chairs_test`, `musical_chairs_demo`, `musical_chairs` |
  | Keycloak realm `hsp`, client `hsp-api`, role `hsp-admin`, users `*@hsp.local` | `musical_chairs`, `musical-chairs-api`, `musical-chairs-admin`, `*@musical-chairs.local` |
  | Problem type base `https://hsp.example/problems/` | `https://musical-chairs.example/problems/` |
  | Metrics `hsp_*` | `musical_chairs_*` |
  | Session cookie `hsp_session` | `musical_chairs_session` |
  | Browser storage keys `hsp.theme`, `hsp.language`, `hsp.sidebar`, … | `musical_chairs.theme`, … |
  | Frontend package `hsp-frontend` | `musical-chairs-frontend` |
  | GitHub `reznik-gev/HSP` | `reznik-gev/MusicalChairs` |

- **Decision records are rewritten in place** to say Musical Chairs, with no change to what any record decided. *(The owner's choice)* File names that contain `hsp` are renamed too, and links to them are updated. *(Claude's choice)* Two records keep the old name, in their text and in their file names, because the old name is their subject: [0072](0072-2026-10-08-rename-hsm-to-hsp.md) and this one. *(Claude's choice)*
- **The rename is its own PR**, separate from this record's. It starts once every PR that was open on 2026-11-21 has merged. *(The owner's choice)*

## Consequences
- **The rename PR** does it with scripted replacements in a fixed order, then regenerates both `uv.lock` files, `pnpm-lock.yaml` and the OpenAPI export. It runs every check on all three sides, and records the guide's GIFs again ([0147](0147-2026-11-17-the-guides-gifs-are-recorded-again-before-each-release.md)). Estimate: about 2.5–4 hours of agent time.
- **Existing dev stacks and the demo must be recreated once**, because the database, realm and Compose project names change. The rename PR writes the exact commands in its description. Also update any local `.env` from `HSP_*` to `MUSICAL_CHAIRS_*`.
- **Everyone is signed out once**, and saved browser settings (theme, language, sidebar) reset once, because the cookie and storage keys are renamed. Nobody runs a release yet, so this only touches the demo and dev stacks.
- **The migration revision IDs are unchanged**, so no database migration is needed for the rename itself.
- **After the rename merges, the owner** renames the GitHub repository (GitHub redirects the old links) and may rename the local checkout folder. Claude's memory for this project lives in a folder named after the checkout, so it is copied across at the same time.
- Git history, earlier commit messages and closed PR titles still say HSP. That's expected.

## Updates
- *Update, 2026-11-21:* the rename PR settled the cases the table above leaves open. Each says whose choice it is; Claude's choices are lower-confidence.
  - **"HSP's" becomes "Musical Chairs'"**, and "an HSP" becomes "a Musical Chairs". *(Claude's choice)*
  - **The realm's name, file names and the browser tab title** differ from this record's table where [0152](0152-2026-11-22-keycloak-realm-name-and-file-names.md) says so. That record refines this one.
  - **The development session key** in `backend/src/musical_chairs/config.py` is now `musical-chairs-dev-only-sessions`. A Fernet key must be exactly 32 bytes, and the old text was exactly 32. *(Claude's choice)*
  - **In Hebrew guide text and the maintenance page**, the name is written in Hebrew and takes a feminine singular verb ("כיסאות מוזיקליים מציגה"). *(The owner's choice, in review)* The sidebar shows "MC", as this record says above. The browser tab title is in 0152.
  - **The backup archive's two dump files** are `musical_chairs.dump` and `keycloak.dump`. They list in that order now, not the old one. *(Claude's choice)*
- *Update, 2026-11-22:* a correction to the note above about the backup archive's dump files. Files in the archive list in alphabetical order, so `keycloak.dump` now comes first, where `hsp.dump` used to. The order follows from the new name, and nobody chose it. The note above said the files "list in that order now", meaning `musical_chairs.dump` first, which is wrong. Two tests that check the list were updated for the new order.
