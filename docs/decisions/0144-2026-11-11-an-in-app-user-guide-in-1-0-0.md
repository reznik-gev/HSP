# 0144 — An in-app user guide ships in 1.0.0

- **Date:** 2026-11-11
- **Status:** Accepted
- **Refines:** [0130](0130-2026-11-08-learning-the-editor.md) (the user guide comes after 1.0.0, in `docs/tutorials/`)

## Context
[0130](0130-2026-11-08-learning-the-editor.md) gave the editor a hint line and a **Keyboard and mouse** sheet for 1.0.0, and left a guided tour and a user guide in `docs/tutorials/` for after it. Going over what's left before 1.0.0, the owner asked for a guide that onboards people to HSP. HSP is installed offline ([0054](0054-2026-10-08-release-distribution.md)), so a guide on a website or in the repository wouldn't reach every customer.

## Options considered
- Who it's for:
  - **Admins and everyone** ✅: one guide in two parts, like the CHANGELOG.
  - Admins only: smaller, but leaves out the people who only look things up.
  - Admins, everyone and operators: duplicates `docs/install.md`, which already ships in the bundle.
- Where it's read:
  - **Inside the app** ✅: it ships with every release and works offline.
  - Markdown pages in `docs/tutorials/`, linked from the app: they don't reach an offline install unless HSP serves them.
  - A PDF in the bundle: easy to send, but nobody opens it from the app.
- When:
  - **In 1.0.0** ✅: the first customers have it from day one. It's mostly text, so it holds the release up by days, not weeks.
  - Right after 1.0.0, as 0130 planned: 1.0.0 ships sooner, but customers rely on the hint line and the keys sheet until then.

## Decision
1. **A user guide ships in 1.0.0, inside the app.** *(The owner's choice)*
2. **For admins and for everyone.** One part covers what everyone does: finding where someone sits, the floor plan, free seats, language and theme. The other covers admins: sites, buildings and floors, drawing in the editor, people and teams, imports, the catalog and devices, assigning seats and publishing. Operators keep `docs/install.md`. *(The owner's choice)*
3. **As simple and as textual as possible:** short pages of text, a few GIFs where a move is easier shown than told, and links to the screens they describe. *(The owner's choice)*
4. **In English and Hebrew,** like every text in HSP. The Hebrew pages mirror. *(Required by CLAUDE.md)*
5. **Each GIF is recorded in both languages.** The Hebrew pages show HSP in Hebrew, right to left, as their readers see it. *(The owner's choice, asked in review: English GIFs on both pages, or none on the Hebrew pages, were the other options.)*
6. Smaller details, *(Claude's choices, lower confidence)*:
   - **Where it opens:** a **User guide** item in the user menu, beside the release version, opens a Guide page in HSP. Every signed-in user can open it. Admins see both parts; others see only the first.
   - **How many GIFs:** no more than about six, short and without sound: drawing walls, placing and numbering desks, publishing, assigning a seat, finding someone, and showing free seats, recorded from the Northwind demo.
   - **The editor's own help stays where it is.** The guide links to the **Keyboard and mouse** sheet for the full list of keys, and doesn't repeat it.
   - **How the pages are written and shown** (for example Markdown files in the frontend, rendered when the app is built) is settled in the PR that builds it. A new dependency for it gets its own line in that PR's records.

## Consequences
- 1.0.0 also waits for the guide.
- A change to something the guide describes updates the guide, in both languages, in the same PR. The review checklist in [testing.md](../guides/testing.md) and the PR template don't say this yet; the PR that builds the guide adds it.
- The guided tour on first use stays after 1.0.0 ([0130](0130-2026-11-08-learning-the-editor.md)). `docs/tutorials/` isn't needed for now.
