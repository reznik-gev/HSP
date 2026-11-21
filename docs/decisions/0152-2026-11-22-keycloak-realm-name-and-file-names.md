# 0152 — The Keycloak realm is `musical-chairs`, and no file name mixes `-` and `_`

- **Date:** 2026-11-22
- **Status:** Accepted
- **Refines:** [0150](0150-2026-11-21-rename-hsp-to-musical-chairs.md) (the realm's name in its table, the rule for file names, and the browser tab title)

## Context
While the owner reviewed the rename PR (#182), three things came up that 0150 either settled differently or did not say.

- **File names.** The rename gave two scripts and two Keycloak files names that mix `-` and `_`: `10-musical_chairs.sh`, `40-musical_chairs.sh` and `musical_chairs-realm.json`. The owner found this confusing and asked for no such names.
- **The realm.** Keycloak refuses to start when an import file's name differs from its realm: "File name / realm name mismatch". (Tried with Keycloak 26.8.) 0150's table says the realm is `musical_chairs`, so the file had to be `musical_chairs-realm.json`. The file can use only `-` if the realm does.
- **The browser tab title.** 0150 says the tab shows the full name in the reader's language. The code doesn't: `frontend/index.html` has a fixed `<title>Musical Chairs</title>`, as it had "HSP" before, and nothing sets `document.title`.

## Options considered
**The Keycloak realm:**
- **`musical-chairs`** ✅ Matches the client `musical-chairs-api` and the role `musical-chairs-admin`, and lets the import file use only `-`. It changes about 15 files and the sign-in URL. No release or install exists yet, and the rename already makes everyone sign in again and recreate their dev stack once.
- `musical_chairs`, with the file `musical_chairs-realm.json`: no extra change, but it leaves the only file name that mixes `-` and `_`.

**File names:**
- **No name mixes `-` and `_`** ✅
- Follow the rules for names in code, which allow a mix: this is what 0150's note first did.

**The tab title:**
- **Keep the fixed English title for now, and follow the language in a later PR** ✅ The rename PR changes no behaviour, and this is a change people notice.
- Make it follow the language in the rename PR: a UI change in an already large PR.

## Decision
- **The Keycloak realm is `musical-chairs`.** *(The owner's choice)* The issuer is `…/realms/musical-chairs`, the import files are `musical-chairs-realm.json`, and Keycloak's default role is `default-roles-musical-chairs`. The client `musical-chairs-api` and the role `musical-chairs-admin` stay as 0150 says. This replaces `musical_chairs` in 0150's table row for the realm.
- **No file name mixes `-` and `_`.** *(The owner's choice)* So the scripts are `10-musical-chairs.sh` and `40-musical-chairs.sh`, and a record's file name is a slug of words with `-`. A name with no `-` keeps `musical_chairs`, as in code (`deploy/web/musical_chairs/`, `musical_chairs.conf.template`). *(Claude's choice)*
- **The browser tab title stays "Musical Chairs" in both languages for now.** *(Claude's choice)* This goes against "in the reader's language" in 0150, until the next point is done.
- **A follow-up PR makes the tab title follow the language.** *(The owner's choice)* It sets `document.title` from `app.fullName` when the language changes. In Hebrew the title is the Hebrew name alone, because a title that mixes Hebrew and English can show its parts in an unexpected order.

## Consequences
- **The rename PR (#182) does the first two points:** the realm files, the two scripts, the issuer URLs, the `kcadm.sh` commands in `bin/musical-chairs` and `test-bundle.sh`, the tests, the docs and the demo seed.
- **Dev stacks and the demo** are recreated once for the rename anyway. That also imports the new realm.
- **The follow-up PR** changes `frontend/` only. It needs a small test that the title changes with the language.
- **0150** gets a `Refined by:` line, and its dated note points here instead of deciding these points itself.
