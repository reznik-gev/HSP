# 0147 — The guide's GIFs are recorded again before each release

- **Date:** 2026-11-17
- **Status:** Accepted
- **Refines:** [0146](0146-2026-11-11-how-the-user-guide-is-written-and-shown.md) (a PR that changes a screen makes the GIFs again)

## Context
[0146](0146-2026-11-11-how-the-user-guide-is-written-and-shown.md) said a PR that changes something the guide describes makes the GIFs again if one no longer matches. In the review of [#171](https://github.com/reznik-gev/HSP/pull/171), the owner found that too costly. Recording needs the demo up and ffmpeg, and many PRs change a screen a little. Changing the guide's words never needed new GIFs.

## Options considered
- When the GIFs are recorded:
  - **Before each release** ✅: every change users see, big or small, is in the GIFs when a version ships. It costs one recording per release, not one per PR. Between releases, a GIF on `main` may show an older screen.
  - In the PR that changes the screen (0146): always correct, but every PR that changes the UI pays for a recording.
  - Only for big changes, such as a new feature, a UI redesign or a breaking change: fewer recordings, but someone has to judge "big" in every PR, and small changes still reach a release with old GIFs.
- How we make sure it happens:
  - **A step in the releasing guide only** ✅: no new machinery. A release can still go out with old GIFs if the step is skipped.
  - The guide step, and the release workflow stops a tag when `frontend/src` changed after the GIFs were last recorded. `pnpm guide:gifs` would write a stamp file to compare against. Set aside for now, for velocity.
  - A test that fails when the GIFs are older than the screens they show: the same check, but on every PR. Set aside for now, for velocity.
  - The release workflow records the GIFs itself: fully automatic, but nobody sees them before customers do, and CI would need the demo and ffmpeg.

## Decision
1. **The GIFs are recorded again before each release,** not in the PR that changes a screen. A PR that changes something the guide describes still updates the guide's text in both languages. *(The owner's choice)*
2. **The releasing guide makes it a step of the release PR:** bring up the demo, run `pnpm guide:gifs`, look at each GIF in both languages, and commit them in the release PR. *(The owner's choice)*
3. **Nothing checks this yet.** We want a check later, in a test or in the release workflow, so a release can't go out with old GIFs. For now we chose not to build one, for velocity. *(The owner's choice)*

## Consequences
- [Releasing HSP](../guides/releasing.md) gains the step. [How a change is made](../guides/making-a-change.md) and the [review checklist](../guides/testing.md#review-checklist) ask only for the guide's text to be updated.
- Between releases, a GIF on `main` may show an older screen than the app.
- A check that the GIFs are newer than the last UI change is left for later.
