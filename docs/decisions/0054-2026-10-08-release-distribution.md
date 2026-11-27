# 0054 — Release distribution: offline bundle only

- **Date:** 2026-10-08
- **Status:** Accepted
- **Refined by:** [0158](0158-2026-11-27-a-readme-at-the-top-of-the-release-bundle.md) (a README at the bundle's top)

## Options considered
- Registry + offline bundle
- Registry only
- **Offline bundle only** ✅

## Decision
Every installation, connected or air-gapped, is done from a single versioned archive:
```
musical-chairs-<version>.tar.gz
  images/            docker image tarballs (api, frontend, nginx, keycloak, postgis, backup, migrate
                     + optional monitoring images, 0057)
  compose/           docker-compose.yml, profiles, .env.example
  config/            nginx, keycloak realm template
  bin/musical-chairs            operator CLI (install, upgrade, backup, restore, status)
  docs/              operator guide, release notes, upgrade notes
  SHA256SUMS
```
- `musical-chairs install` / `musical-chairs upgrade` load images with `docker load`. **No registry is ever contacted.**
- Integrity: `SHA256SUMS` is verified by `bin/musical-chairs` before installing. Signing is not in v1 ([0059](0059-2026-10-08-supply-chain-security.md)).

## Consequences
- One uniform install path, tested in CI from the same artifact customers receive.
- The bundle is large: roughly 1–2 GB, dominated by the Keycloak, PostGIS and optional monitoring images. Each release ships complete images, not deltas.
- Connected customers don't get `docker pull` convenience. Adding a registry channel later is purely additive.
