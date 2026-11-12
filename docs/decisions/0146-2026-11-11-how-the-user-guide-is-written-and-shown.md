# 0146 — How the user guide is written and shown

- **Date:** 2026-11-11
- **Status:** Accepted
- **Refines:** [0144](0144-2026-11-11-an-in-app-user-guide-in-1-0-0.md) (left how the pages are written and shown to the PR that builds the guide)

## Context
[0144](0144-2026-11-11-an-in-app-user-guide-in-1-0-0.md) put a user guide inside HSP for 1.0.0: mostly text, a few GIFs and links, in English and Hebrew. It left the format and the GIFs' making to the PR that builds it.

## Options considered
- How the pages are written:
  - **Markdown files in the frontend, with a small renderer of our own** ✅: easy to write and review as text. The renderer knows only what the guide uses (headings, paragraphs, lists, tips, GIFs, bold, keys and links inside HSP), in about 150 lines, and never passes HTML through.
  - Markdown with a library such as react-markdown: handles all of Markdown, but brings a dozen packages for a few pages.
  - Texts in `en.json` and `he.json`, like the rest of the app: long pages are hard to write and review as JSON strings.
- How the GIFs are made:
  - **A Playwright script that drives the Northwind demo** ✅, so they can be made again when a screen changes, in both languages. Chrome's screencast captures the frames, and ffmpeg turns them into GIFs.
  - Recorded by hand with a screen recorder: quicker once, but each new recording looks different.
  - Playwright's own video recording: it needs Playwright's own build of ffmpeg, a separate download.

## Decision
*(Claude's choices)*
1. **The pages are Markdown,** in `frontend/src/guide/en/` and `he/`: `everyone.md` and `admins.md` in each. They're built into the app, so they work offline. The Guide page is at `/guide` and loads only when opened.
2. **A small renderer of our own** (`guide/markdown.tsx`), with no new dependency. Links go only to pages inside HSP, since installations are offline. A test fails if a page uses HTML or a link outside HSP, if the two languages don't have the same headings, lists and GIFs, or if a GIF is missing.
3. **Six GIFs, in each language** (0144 point 5), 800 px wide at 10 frames a second, 50–170 KB each, in `media/en/` and `media/he/`: finding someone, showing free seats, drawing walls, placing and numbering desks, publishing, and assigning a seat. `pnpm guide:gifs` makes all twelve again from the demo (`frontend/e2e/guide/`). The script reads every label from `en.json` and `he.json`, and sets the demo user's language for each set. It needs the demo up and ffmpeg installed, and leaves the demo as it was, the user's preferences included.
4. **The contents** at the top of the page list both parts' sections, and link to each.

## Consequences
- A change to something the guide describes updates the guide in both languages in the same PR, and makes the GIFs again if one no longer matches. [How a change is made](../guides/making-a-change.md) and the [review checklist](../guides/testing.md#review-checklist) say so.
- Recording leaves a discarded draft in Floor 5's version history on the demo each time. The next reseed clears it.
