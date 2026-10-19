# 0102 — The release workflow: build, test and publish the bundle

- **Date:** 2026-10-19
- **Status:** Accepted
- **Builds on:** [0054](0054-2026-10-08-release-distribution.md) (the bundle), [0063](0063-2026-10-08-release-versioning.md) (versions), [0064](0064-2026-10-08-branching-workflow.md) (tags and `release/X.Y`), [0097](0097-2026-10-18-production-images.md) (images), [0099](0099-2026-10-18-production-compose.md) (the stack, tested only when a release is built)

## Context
HSP is installed from one versioned archive, `hsp-<version>.tar.gz`, with no registry ever contacted (0054). The images (0097) and the Compose stack (0099) exist. Nothing builds the archive, tests it or publishes it yet.

## Options considered
The owner chose each of these:

| Question | Options | Chosen | Why |
|---|---|---|---|
| Where the bundle is published | A private releases repo / **public GitHub Releases on this repo** / cloud storage with expiring links | **Public GitHub Releases** | The simplest, with nothing new to run. The source is public already ([0071](0071-2026-10-08-license-and-contributions.md)), so a private bundle wouldn't keep anything secret. The licence still forbids using HSP without permission. |
| What guards publishing | **An approval step** / a tag ruleset only / any tag push | **Approval step**, plus a tag ruleset | A published release can be downloaded at once. A mistaken tag should cost a build, not a public release. |
| Release notes | **`CHANGELOG.md` kept as we go** / generated from PR titles and edited / generated as is | **`CHANGELOG.md`** | Customers see what changed for them, not internal PRs. The release page and the bundle get the same text. |
| Upgrade test (0056) | **Add it with `bin/hsp`** / build `bin/hsp` first / a temporary test now | **With `bin/hsp`** | It must test `hsp upgrade`, the path customers use. The first release has nothing to upgrade from. |
| What the test runs on the installed bundle | Playwright only / a scripted check only / **both, the check first** | **Both** | The check fails fast with a clear reason. Playwright proves the product works as shipped. |

## Decision
`.github/workflows/release.yml` runs when a tag `vX.Y.Z` or `vX.Y.Z-rc.N` is pushed. It can also be started by hand as a **dry run**, which builds and tests but never publishes. A PR that changes the release workflow or its scripts (`deploy/bundle.sh`, `test-bundle.sh`, `release-notes.sh`) also runs a dry run, so the release machinery is tested before it merges. Ordinary PRs never run it, as 0099 chose (my lower-confidence choice).

1. **Check.**
   - The tag is a valid version (0063).
   - The tagged commit is on `main` or on a `release/X.Y` branch with the same `X.Y` (0064).
   - `CHANGELOG.md` has a section `## [X.Y.Z]` for this version. A dry run uses `## [Unreleased]`.
2. **Build** the three HSP images with the version (`deploy/build-images.sh`).
3. **Assemble** the bundle with `deploy/bundle.sh`. It unpacks into `hsp-<version>/`:
   ```
   images/          one `docker save` tarball per image in compose.yml (HSP's three, plus PostGIS)
   compose/         compose.yml, postgres-init/, .env.example (with HSP_VERSION set)
   docs/            install.md, release-notes.md (this version's entry), CHANGELOG.md
   LICENSE
   VERSION
   SHA256SUMS       every file above
   ```
   The image list comes from `compose.yml`, so the bundle can't miss an image the stack needs. Compared with 0054:
   - There's no `config/`, because the nginx and Keycloak configuration is inside their images (0097).
   - `bin/hsp` comes with its own PR.
   - `LICENSE` and the top-level folder are additions (my lower-confidence choice).
4. **Test the bundle on a clean runner, as a customer gets it** (`deploy/test-bundle.sh`):
   - Check `SHA256SUMS`, `docker load` the images, and install the stack following the steps in `deploy/README.md`, with TLS on (a self-signed certificate for `localhost`).
   - Start it and wait until every service is healthy.
   - Then the **scripted check**: the app loads over HTTPS; HTTP redirects to HTTPS; the security headers are there; the API's `/readyz` answers with the release's version; the API refuses requests without sign-in; Keycloak names the public URL as its issuer; and the Keycloak admin console is closed.
   - Then the **Playwright browser tests** against it: sign in, find a seat, edit and publish a floor, and no Content Security Policy violations. The CSP test is new; it was run once by hand for #89.
5. **Publish** only after the test passes and the owner approves it in the protected **`release` environment**:
   - a GitHub Release on this repo, with the bundle, its `.sha256` file, and the version's `CHANGELOG.md` entry as the notes.
   - `-rc.N` versions are marked as pre-releases.
   - A **tag ruleset** lets only admins create `v*` tags.

**`CHANGELOG.md`** has an `## [Unreleased]` section. Each PR that changes something users or operators notice adds a line there, in plain English. To release, a PR renames the section to `## [X.Y.Z] - YYYY-MM-DD` and opens a new empty `[Unreleased]`. Then the tag is pushed. The notes are **English only** (my lower-confidence choice): the English-and-Hebrew rule is for text in the app, and these are for the person installing it. [`docs/guides/releasing.md`](../guides/releasing.md) has the steps.

## Consequences
- A release takes about 20–30 minutes before it waits for approval. Most of that is the build, saving the images, and starting the stack.
- The bundle is about 0.7–1 GB. A GitHub Release file may be up to 2 GB, so `bundle.sh` fails above 1.9 GB.
- Anyone can download a published release. Taking one down is possible, but someone may already have it.
- A stack wiring mistake is still found only when a release is built (0099). A dry run (Actions → release → Run workflow) finds it earlier, when wanted.
- The upgrade test is added with `bin/hsp`. Until then, releases are tested as fresh installs only.
