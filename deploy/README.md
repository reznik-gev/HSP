# Deployment

How HSP is packaged and run outside development. For local development, see the [main README](../README.md) (`compose.dev.yml`).

## Production images
HSP ships three images, all amd64, all running as non-root and configured only through environment variables ([0097](../docs/decisions/0097-2026-10-18-production-images.md)):

| Image | Built from | What it is |
|---|---|---|
| `hsp-api` | [`backend/Dockerfile`](../backend/Dockerfile) | The API on port 8000 (`HSP_API_WORKERS` uvicorn workers, default 4). Also runs the one-shot migrate job: `alembic upgrade head`. |
| `hsp-web` | [`web/Dockerfile`](web/Dockerfile) + the frontend | HSP's single entry point: nginx with the built frontend, routing `/api/` to the API and `/auth/` to Keycloak ([0098](../docs/decisions/0098-2026-10-18-web-entry-point.md)). HTTP on 8080, HTTPS on 8443, health on 8081 (`/healthz`, never published). |
| `hsp-keycloak` | [`keycloak/Dockerfile`](keycloak/Dockerfile) | Keycloak, pre-built for PostgreSQL and the `/auth` path, started with `start --optimized --import-realm`. Imports the `hsp` realm on first start, filling `${HSP_PUBLIC_URL}` and `${HSP_OIDC_CLIENT_SECRET}` from the environment. |

PostgreSQL is the published `postgis/postgis` image.

### `hsp-web` settings
| Variable | Default | Meaning |
|---|---|---|
| `HSP_WEB_TLS` | `on` | `on`: `hsp-web` terminates TLS; HTTP redirects to HTTPS. `off`: a proxy or load balancer in front terminates TLS, and `hsp-web` serves HTTP on 8080. |
| `HSP_PUBLIC_URL` | (none) | Where users reach HSP, e.g. `https://hsp.example.com`. Required when TLS is on (the redirect goes there). |
| `HSP_TLS_CERT`, `HSP_TLS_KEY` | `/etc/hsp/tls/tls.crt`, `.key` | Certificate (with its chain) and key files, mounted into the container. |
| `HSP_HSTS` | `on` | Send HSTS (1 year, this host only) when TLS is on. |
| `HSP_TRUSTED_PROXIES` | (none) | With TLS off: addresses or CIDRs of the proxy in front, whose `X-Forwarded-For` and `X-Forwarded-Proto` are trusted. |
| `HSP_KEYCLOAK_ADMIN_FROM` | (none) | Networks (CIDRs) allowed to open Keycloak's admin console at `/auth/admin`. Empty: nobody, through `hsp-web`. |
| `HSP_API_UPSTREAM`, `HSP_KEYCLOAK_UPSTREAM` | `api:8000`, `keycloak:8080` | Where the API and Keycloak are. |
| `HSP_RESOLVER` | `127.0.0.11` | DNS server for those names (Docker's; a cluster DNS on Kubernetes). |

Build and check them locally (Docker with BuildKit):
```bash
deploy/build-images.sh            # tagged 0.0.0-dev; or deploy/build-images.sh 1.2.0
deploy/smoke-images.sh            # starts each image and checks it answers
```
CI runs both on every PR that touches the app or the images; nothing is pushed anywhere.
