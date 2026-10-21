# Releasing HSP

How a version of HSP becomes a published release that customers install. The decision behind it is [0102](../decisions/0102-2026-10-19-release-workflow.md). Versions are MAJOR.MINOR.PATCH ([0063](../decisions/0063-2026-10-08-release-versioning.md)), tagged on `main`, or on `release/X.Y` for hotfixes ([0064](../decisions/0064-2026-10-08-branching-workflow.md)).

## Between releases: keep the changelog
A PR that changes something users or operators notice adds a line under `## [Unreleased]` in [`CHANGELOG.md`](../../CHANGELOG.md), in the same PR.
- Write it for the person using or running HSP: what they can do now, or what changed for them. "Find where someone sits from the top bar", not "Add the search endpoint".
- Group lines under **For everyone**, **For admins** and **For operators**. Leave out internal changes: tests, refactors, CI.
- English only. These notes are for operators, not text in the app.

## Cutting a release
1. **Pick the version** with 0063's rules: MAJOR for breaking changes, MINOR for features, PATCH for fixes only.
2. **Open a release PR** that renames `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, and adds a new empty `## [Unreleased]` above it. Merge it once CI passes. The version number itself comes from the tag at build time (0063), so no file needs it.
3. **Tag the merged commit and push the tag:**
   ```bash
   git switch main && git pull
   git tag -a vX.Y.Z -m "HSP X.Y.Z"
   git push origin vX.Y.Z
   ```
   Only admins can create `v*` tags (a tag ruleset).
4. **Watch the release workflow** (Actions → release). It checks the tag and the changelog, builds the images, assembles `hsp-X.Y.Z.tar.gz`, then installs it on a clean runner. There it runs the scripted check and the Playwright browser tests. In parallel, the **upgrade test** installs the last published release (not a pre-release), upgrades it to this one with `hsp upgrade`, checks it, rolls back with `hsp rollback` and checks again ([0107](../decisions/0107-2026-10-21-operator-cli.md)). Until a release exists, it's skipped with a notice. This takes about 20–30 minutes.
5. **Approve the publish step.** The workflow then waits at the `release` environment. Open the run, read the summary, and choose **Review deployments → Approve**. Only then does the GitHub Release appear, with the bundle, its `.sha256` file and the changelog entry as its notes.

### Release candidates
Tag `vX.Y.Z-rc.N` to try a version before releasing it. It goes through the same steps, and is published as a **pre-release** with the notes of `## [X.Y.Z]`. So the release PR comes first, as for a final release. When the candidate is good, tag the same commit `vX.Y.Z`.

### Hotfixes for an older version
Create `release/X.Y` from the `vX.Y.Z` tag, if it doesn't exist yet. Cherry-pick the fix from `main`, add its `## [X.Y.Z+1]` entry to that branch's `CHANGELOG.md`, and tag `vX.Y.Z+1` there. The workflow accepts tags on `release/X.Y` branches whose `X.Y` matches the tag.

## When something fails
- **"isn't a release tag"** or **"on neither main nor release/X.Y"**: delete the tag (`git push origin :vX.Y.Z`; it was never published), fix it, and tag again.
- **"no '## [X.Y.Z]' section"**: the release PR is missing or was named differently. Fix `CHANGELOG.md` in a PR, then move the tag to the new commit.
- **The upgrade test fails:** the new release can't upgrade an installation of the last one, or roll it back. Its job shows where, with the stack's logs. Nothing was published.
- **The bundle test fails:** the run shows the failing check, the stack's logs and the Playwright traces (the `playwright-traces` artifact). Nothing was published. Fix it, then release a new commit.
- **A dry run** builds and tests without publishing: Actions → release → **Run workflow**, on any branch. It uses the `## [Unreleased]` notes. PRs that change the release workflow or its scripts run one on their own.

## Trying a bundle by hand
```bash
deploy/build-images.sh 1.2.0-rc.0
deploy/release-notes.sh Unreleased > /tmp/notes.md
deploy/bundle.sh 1.2.0-rc.0 /tmp/notes.md dist
deploy/test-bundle.sh dist/hsp-1.2.0-rc.0.tar.gz     # Linux only; KEEP=1 leaves it running
```
