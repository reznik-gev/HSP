# Releasing Musical Chairs

How a version of Musical Chairs becomes a published release that customers install. The decision behind it is [0102](../decisions/0102-2026-10-19-release-workflow.md). Versions are MAJOR.MINOR.PATCH ([0063](../decisions/0063-2026-10-08-release-versioning.md)), tagged on `main`, or on `release/X.Y` for hotfixes ([0064](../decisions/0064-2026-10-08-branching-workflow.md)).

## Between releases: keep the changelog
A PR that changes something users or operators notice adds a line under `## [Unreleased]` in [`CHANGELOG.md`](../../CHANGELOG.md), in the same PR.
- Write it for the person using or running Musical Chairs: what they can do now, or what changed for them. "Find where someone sits from the top bar", not "Add the search endpoint".
- Group lines under **For everyone**, **For admins** and **For operators**. Leave out internal changes: tests, refactors, CI.
- English only. These notes are for operators, not text in the app.

## Cutting a release
1. **Pick the version** with 0063's rules: MAJOR for breaking changes, MINOR for features, PATCH for fixes only.
2. **Open a release PR** that renames `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, and adds a new empty `## [Unreleased]` above it. Merge it once CI passes. The version number itself comes from the tag at build time (0063), so no file needs it.
   - **In the same PR, record the user guide's GIFs again** ([0147](../decisions/0147-2026-11-17-the-guides-gifs-are-recorded-again-before-each-release.md)): bring up the Northwind demo, freshly seeded and showing the new version ([0156](../decisions/0156-2026-11-27-the-guides-gifs-show-the-version-being-released.md): `MUSICAL_CHAIRS_VERSION=X.Y.Z uv run python ../deploy/demo/demo.py switch --main`, from `backend/`), and run `pnpm guide:gifs` in `frontend/` (it needs ffmpeg). Look at each of the twelve GIFs, in English and in Hebrew, and commit them. Nothing checks this step yet, so don't skip it.
3. **Tag the merged commit and push the tag:**
   ```bash
   git switch main && git pull
   git tag -a vX.Y.Z -m "Musical Chairs X.Y.Z"
   git push origin vX.Y.Z
   ```
   Only admins can create `v*` tags (a tag ruleset).
4. **Watch the release workflow** (Actions → release). It checks the tag and the changelog, builds the images, assembles `musical-chairs-X.Y.Z.tar.gz`, and lists the known vulnerabilities in its images and packages ([0128](../decisions/0128-2026-11-08-vulnerability-scanning.md)). Then it installs it on a clean runner. There it runs the scripted check and the Playwright browser tests. In parallel, the **upgrade test** installs the last published release (not a pre-release), upgrades it to this one with `musical-chairs upgrade`, checks it, rolls back with `musical-chairs rollback` and checks again ([0107](../decisions/0107-2026-10-21-operator-cli.md)). Until a release exists, it's skipped with a notice. This takes about 20–30 minutes.
5. **Check the run together, before approving** ([0157](../decisions/0157-2026-11-27-what-to-do-about-1-0-0s-scan-findings.md)). The workflow waits at the `release` environment. A Claude Code session reads the run and reports:
   - each job's result, and which checks and browser tests actually ran;
   - the version, whether it's a pre-release, and the notes;
   - every vulnerability finding, compared with the accepted ones in [0129](../decisions/0129-2026-11-08-first-scan-findings.md) and 0157. The findings only warn, so nothing stops a release that has them. The session brings only what's new or newly fixable, each with a recommendation.

   The owner decides to fix or accept each of those. Accepted ones are written into a record. A fix goes in a PR, and then a new release candidate.
6. **Approve the publish step** (the owner): **Review deployments → Approve**. The repository is public, so the release is public from then on. Only then does the GitHub Release appear, with the bundle, its `.sha256` file and the changelog entry as its notes. The session checks the Release page: title, pre-release mark, notes and both files.
7. **Try the bundle by hand** (the owner), for the first release candidate of a release that changes how Musical Chairs is installed, 1.0.0 included: on a clean Linux host, check the `.sha256`, then follow the bundle's `docs/install.md` as an operator would. Sign in, look at the version in the sidebar, open the user guide, take a backup and restore it. Try Active Directory sign-in if you can: the runner can't.

**Who does what:** a session prepares the release PR, reads each run and checks the published release. Only the owner approves the release PR and says when it merges, pushes the tags, decides on findings and approves the publish step.

### Release candidates
Tag `vX.Y.Z-rc.N` to try a version before releasing it. It goes through the same steps, and is published as a **pre-release** with the notes of `## [X.Y.Z]`. So the release PR comes first, as for a final release. If a candidate needs a fix, merge it in a PR and tag the new commit `vX.Y.Z-rc.N+1`. When a candidate is good, tag its commit `vX.Y.Z`. Pre-releases never count as "the last published release" for the upgrade test.

### Hotfixes for an older version
Create `release/X.Y` from the `vX.Y.Z` tag, if it doesn't exist yet. Cherry-pick the fix from `main`, add its `## [X.Y.Z+1]` entry to that branch's `CHANGELOG.md`, and tag `vX.Y.Z+1` there. The workflow accepts tags on `release/X.Y` branches whose `X.Y` matches the tag.

## When something fails
- **"isn't a release tag"** or **"on neither main nor release/X.Y"**: delete the tag (`git push origin :vX.Y.Z`; it was never published), fix it, and tag again.
- **"no '## [X.Y.Z]' section"**: the release PR is missing or was named differently. Fix `CHANGELOG.md` in a PR, then move the tag to the new commit.
- **The upgrade test fails:** the new release can't upgrade an installation of the last one, or roll it back. Its job shows where, with the stack's logs. Nothing was published.
- **The bundle test fails:** the run shows the failing check, the stack's logs and the Playwright traces (the `playwright-traces` artifact). Nothing was published. Fix it, then release a new commit.
- **A dry run** builds and tests without publishing: Actions → release → **Run workflow**, on any branch. It uses the `## [Unreleased]` notes, or a placeholder line while that section is empty, as it is right after a release PR ([0157](../decisions/0157-2026-11-27-what-to-do-about-1-0-0s-scan-findings.md)). PRs that change the release workflow or its scripts run one on their own.

## Trying a bundle by hand
```bash
deploy/build-images.sh 1.2.0-rc.0
deploy/release-notes.sh --not-a-release Unreleased > /tmp/notes.md
deploy/bundle.sh 1.2.0-rc.0 /tmp/notes.md dist
deploy/test-bundle.sh dist/musical-chairs-1.2.0-rc.0.tar.gz     # Linux only; KEEP=1 leaves it running
```
