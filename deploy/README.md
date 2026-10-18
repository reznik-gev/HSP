# Deployment

How HSP is packaged and run outside development. For local development, see the [main README](../README.md) (`compose.dev.yml`).

## Production images
HSP ships three images, all amd64, all running as non-root and configured only through environment variables ([0097](../docs/decisions/0097-2026-10-18-production-images.md)):

| Image | Built from | What it is |
|---|---|---|
| `hsp-api` | [`backend/Dockerfile`](../backend/Dockerfile) | The API on port 8000 (`HSP_API_WORKERS` uvicorn workers, default 4). Also runs the one-shot migrate job: `alembic upgrade head`. |
| `hsp-web` | [`web/Dockerfile`](web/Dockerfile) + the frontend | nginx with the built frontend, on port 8080. Health on port 8081 (`/healthz`), never published. |
| `hsp-keycloak` | [`keycloak/Dockerfile`](keycloak/Dockerfile) | Keycloak, pre-built for PostgreSQL and the `/auth` path, started with `start --optimized --import-realm`. Imports the `hsp` realm on first start, filling `${HSP_PUBLIC_URL}` and `${HSP_OIDC_CLIENT_SECRET}` from the environment. |

PostgreSQL is the published `postgis/postgis` image.

Build and check them locally (Docker with BuildKit):
```bash
deploy/build-images.sh            # tagged 0.0.0-dev; or deploy/build-images.sh 1.2.0
deploy/smoke-images.sh            # starts each image and checks it answers
```
CI runs both on every PR that touches the app or the images; nothing is pushed anywhere.
