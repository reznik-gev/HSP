# 0156 — The guide's GIFs show the version being released

- **Date:** 2026-11-27
- **Status:** Accepted
- **Refines:** [0147](0147-2026-11-17-the-guides-gifs-are-recorded-again-before-each-release.md) (how the GIFs are recorded before each release)

## Context
[0147](0147-2026-11-17-the-guides-gifs-are-recorded-again-before-each-release.md) has the user guide's GIFs recorded again in each release PR, from the Northwind demo. The demo runs a development build, so the sidebar's footer in every GIF read "Musical Chairs 0.0.0-dev" ([0104](0104-2026-10-21-v1-release-scope-and-support.md) put the version there). The owner noticed it while reviewing the 1.0.0 release PR, [#200](https://github.com/reznik-gev/MusicalChairs/pull/200).

The app takes its version from `MUSICAL_CHAIRS_VERSION` when it's built or started (`frontend/vite.config.ts`), and `deploy/demo/demo.py` passes its own environment on to both demo servers. So the demo can show any version without a code change.

## Options considered
- **The GIFs show the version being released** ✅: the guide looks like the release it ships in. It costs one variable on the command that brings up the demo.
- Keep "0.0.0-dev": nothing to do, but every release's guide shows a version that was never released.
- Cut the footer out of the GIFs: more work in the recording script, and the GIFs no longer show the whole screen.

## Decision
1. **The GIFs show the version being released.** Before recording them in the release PR, the demo is brought up with `MUSICAL_CHAIRS_VERSION` set to that version. *(The owner's choice)*
2. **Every guide that tells how to record the GIFs says so:** the releasing guide, the frontend README, the recording config's comment, [How a change is made](../guides/making-a-change.md) and the testing checklist. *(The owner's choice)*
3. **The command is the demo's own:** `MUSICAL_CHAIRS_VERSION=X.Y.Z uv run python ../deploy/demo/demo.py switch --main`, from `backend/`. Both demo servers get the version, as in a real installation, and no code changes. *(Claude's choice)*
4. **A release candidate's GIFs show the final version,** `X.Y.Z`, not `X.Y.Z-rc.N`. The release PR comes before the candidate's tag, and the final release tags the same commit ([the releasing guide](../guides/releasing.md#release-candidates)). *(Claude's choice)*
5. **Nothing checks it**, as nothing checks that the GIFs were recorded again ([0147](0147-2026-11-17-the-guides-gifs-are-recorded-again-before-each-release.md) point 3). *(Claude's choice)*

## Consequences
- The guides in point 2 name the version in the GIF step, and link here.
- 1.0.0's GIFs, in [#200](https://github.com/reznik-gev/MusicalChairs/pull/200), read "Musical Chairs 1.0.0" and "כיסאות מוזיקליים 1.0.0".
- After recording, the demo keeps showing the release's version until it's switched again.
