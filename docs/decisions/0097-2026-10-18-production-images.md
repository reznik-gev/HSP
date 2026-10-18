# 0097 — Production container images

- **Date:** 2026-10-18
- **Status:** Accepted
- **Refines:** [0055](0055-2026-10-08-deployment-target.md) (its `nginx` and `frontend` services become one image), [0054](0054-2026-10-08-release-distribution.md), [0063](0063-2026-10-08-release-versioning.md)

## Context
The offline bundle ([0054](0054-2026-10-08-release-distribution.md)) ships container images, and the single-host Compose deployment ([0055](0055-2026-10-08-deployment-target.md)) runs them. Until now only the API had a Dockerfile, and only for development. This record decides which images HSP builds and how. The owner chose the five main points below. The details marked *(Claude's choice)* are lower-confidence and can change in review.

## Decisions

| Question | Options | Chosen | Why |
|---|---|---|---|
| Which images do we build? | **api + web** / api + frontend + nginx / api + stock nginx | **`hsp-api`, `hsp-web`, `hsp-keycloak`** | `hsp-web` is nginx with the built frontend inside, so there's no nginx proxying to another nginx, and the frontend always matches its server config. `hsp-api` also runs the one-shot migrate job ([0056](0056-2026-10-08-upgrades-and-migrations.md)). PostGIS is used as published. |
| Base images | **Debian slim** / Red Hat UBI / distroless / Alpine | **Debian slim** | `python:3.14-slim` and `nginxinc/nginx-unprivileged`: official, small, glibc (Python wheels such as shapely just work), tracked by Dependabot. UBI lags on Python; distroless has no shell for config templating; Alpine's musl causes odd wheel problems. |
| Keycloak | **Our optimized build** / stock image | **`hsp-keycloak`** | `kc.sh build` bakes in the build-time options (PostgreSQL, health, `/auth` path), so it starts with `start --optimized`: faster, and the same every time. It also holds the realm template, and later a login theme. |
| CPU architectures | **amd64 only, arch-neutral** / both, a bundle each / both, one bundle | **amd64 only** | On-prem servers are almost all x86-64, and one architecture keeps CI fast and the bundle at one size. The Dockerfiles stay **arch-neutral** (nothing downloads an amd64-only binary), so arm64 later is a CI matrix entry and a second bundle, not a redesign. |
| CI before the release workflow exists | **Build on PRs, no push** / same but not required / release only | **Build on PRs, part of `ci-ok`** | An `images` job builds all three images on PRs that touch them, with the BuildKit cache, and smoke-tests them: the API starts and answers `/healthz`, the web image serves the app and its health check, Keycloak builds. A broken Dockerfile is found in its PR, not at release time. |

### Ready for Kubernetes later
v1 runs on one host with Compose ([0055](0055-2026-10-08-deployment-target.md)). The owner asked that the images not stand in the way of a later Kubernetes deployment with an nginx ingress and **several web and API replicas behind a load balancer**. So:
- **Every image is stateless.** Nothing is written inside a container that another replica would need: sessions live in PostgreSQL ([0077](0077-2026-10-08-login-implementation.md)), uploads are processed in the request, logs go to stdout ([0057](0057-2026-10-08-observability.md)).
- **All settings come from environment variables** (and mounted files for certificates). No setting is baked into an image, so the same image runs in Compose and in a Kubernetes Deployment.
- **Non-root, unprivileged ports:** `hsp-api` on 8000 and `hsp-web` on 8080, both as non-root users. This fits Kubernetes' restricted pod security profile.
- **TLS is optional inside `hsp-web`.** On one host it terminates TLS itself ([0060](0060-2026-10-08-reverse-proxy.md)). Behind an ingress, the ingress terminates TLS and `hsp-web` serves plain HTTP.
- **Health endpoints for probes:** the API has `/healthz` and `/readyz`, and `hsp-web` answers `/healthz` on its own internal port, 8081, which is never published.
- **This is the point to revisit if we scale out.** On Kubernetes, the ingress would take over the routing that `hsp-web` does on one host (`/api`, `/auth`), and `hsp-web` would only serve the frontend. If more is needed then, such as serving the frontend from a CDN-like cache or splitting the proxy from the static files, `hsp-web` may be split into separate images. We will make that refactor when there's a customer who needs it, not before.

### Details *(Claude's choice)*
- **Names and tags:** `hsp-api:<version>`, `hsp-web:<version>`, `hsp-keycloak:<version>`, all with the product version ([0063](0063-2026-10-08-release-versioning.md)). There's no registry name in the tag, because images are loaded from the bundle and never pulled ([0054](0054-2026-10-08-release-distribution.md)). Local builds are tagged `0.0.0-dev`.
- **The version** is a build argument, `HSP_VERSION`. The release build sets it from the git tag. The API reports it in `/healthz` and `/readyz`, and every image carries it as the standard `org.opencontainers.image.version` label, together with the source revision and creation time.
- **API workers** are set with `HSP_API_WORKERS` (default 4, per [0055](0055-2026-10-08-deployment-target.md)'s reference host). Uvicorn trusts `X-Forwarded-*` headers from any address in the container network (`FORWARDED_ALLOW_IPS=*`), because the API port is never published. Only `hsp-web` or an ingress can reach it.
- **Build files:** `backend/Dockerfile` (as before), `deploy/web/Dockerfile` (it takes the frontend as a second build context, `--build-context frontend=frontend`) and `deploy/keycloak/Dockerfile`. `deploy/build-images.sh [version]` builds all three locally.
- **Base images are pinned to a minor version** (for example `python:3.14-slim`, `quay.io/keycloak/keycloak:26.8`) and updated by Dependabot ([0059](0059-2026-10-08-supply-chain-security.md)). Pinning by digest isn't needed, because a release saves the exact images into its bundle.
- **This record's `hsp-web` serves only the frontend.** The routing to `/api` and `/auth`, TLS and security headers come in the next step ([0060](0060-2026-10-08-reverse-proxy.md)).

## Consequences
- Three images to build, update and ship. PostGIS stays the published image.
- PRs that touch the app or a Dockerfile run a few minutes longer in CI.
- arm64 hosts aren't supported in v1. Apple Silicon laptops can run the images under emulation for demos, slowly.
- Kubernetes isn't supported in v1, but nothing in the images has to be undone to add it.
