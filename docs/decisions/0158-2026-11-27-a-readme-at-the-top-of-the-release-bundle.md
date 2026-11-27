# 0158 — A README at the top of the release bundle

- **Date:** 2026-11-27
- **Status:** Accepted
- **Refines:** [0054](0054-2026-10-08-release-distribution.md) (the offline bundle)

## Context
The owner installed `v1.0.0-rc.1`'s bundle by hand, as an operator would ([0157](0157-2026-11-27-what-to-do-about-1-0-0s-scan-findings.md) point 4). Its top level held `bin/`, `compose/`, `docs/`, `images/`, `LICENSE`, `SHA256SUMS` and `VERSION`. The guide to start from, `docs/install.md`, was one folder down, and nothing at the top pointed to it. In the owner's words: "People expect a README to greet them."

## Options considered
- **A short `README.md` that points to `docs/install.md`** ✅: it says what the bundle is, the one command that installs, what each file is, and where to get help. The guide stays in one place.
- `install.md` itself, copied to `README.md`: everything at the top, but two copies of a long guide in every bundle, and links inside it that assume it's in `docs/`.

## Decision
1. **Every release bundle has a `README.md` at its top** that greets the operator and points to `docs/install.md`. *(The owner's choice)*
2. **It ships in 1.0.0**, from `v1.0.0-rc.2`, not in 1.1.0 as first planned. *(The owner's choice)*
3. **It's short and points to the guide**, rather than copying it: what Musical Chairs and the bundle are, `sudo bin/musical-chairs install`, a table of what's in the folder, and where to get help. English only, like the guide. *(Claude's choice)*
4. **It's made from `deploy/bundle-readme.md`**, with the version filled in by `deploy/bundle.sh`, and the bundle test checks it names the release and links the guide. *(Claude's choice)*

## Consequences
- `deploy/README.md`'s table of the bundle, `install.md`'s first paragraph and 1.0.0's notes mention the README.
- A change to `deploy/bundle-readme.md` runs a release dry run on its PR, like the bundle's other files.
- When the bundle's contents change, the README's table changes with them.
