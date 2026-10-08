# 0068 — Repository visibility: public

- **Date:** 2026-10-08
- **Status:** Accepted
- **Supersedes:** the "private GitHub repository" part of [0053](0053-2026-10-08-code-hosting-and-ci.md)

## Context
0053 recorded a private repository. It was created **public**, and the product owner confirmed that's intended.

## Options considered
- Make it private (as recorded in 0053)
- **Keep it public** ✅

## Decision
The HSP repository `reznik-gev/HSP` is **public**.

## Consequences
- Anyone can read the code, the decision records and the issue/PR history. **No secrets, customer data or customer names** may ever be committed.
  - The dev-only Keycloak realm (`deploy/dev/keycloak/hsp-realm.json`) contains intentionally public throwaway credentials (`admin/admin`, `dev-secret-change-me`). Production secrets come from `.env` on the host and are never committed ([0054](0054-2026-10-08-release-distribution.md)).
  - GitHub **secret scanning and push protection** are enabled and must stay on.
- GitHub Actions minutes are free and unlimited for public repositories. This also makes it feasible to run every CI job on every PR ([0070](0070-2026-10-08-ci-gate-job.md)).
- **There is no license yet,** so by default the code is "all rights reserved": visible, but not usable by others. Choosing a license is a separate, open decision.
- Security reports need a private channel, because public issues aren't suitable. Add a `SECURITY.md` pointing to GitHub's private vulnerability reporting.
