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

## The production stack
[`compose/compose.yml`](compose/compose.yml) runs HSP on one host ([0055](../docs/decisions/0055-2026-10-08-deployment-target.md), [0099](../docs/decisions/0099-2026-10-18-production-compose.md)): `postgres`, a one-shot `migrate`, `api`, `keycloak` and `web`. Only `web` publishes ports.

`hsp install` will prepare an installation. Until it exists, these are the steps by hand, on a Linux host with Docker Engine and the Compose plugin, with the images loaded (`deploy/build-images.sh <version>`):

1. **Make the installation directory** (for example `/opt/hsp`) and copy in `compose/compose.yml`, `compose/postgres-init/` and `compose/.env.example` as `.env`. Set `HSP_VERSION` and `HSP_PUBLIC_URL` in `.env`.
2. **Write the secrets**, one file each in `secrets/`, and give each to its container's user:
   ```bash
   mkdir -m 700 secrets && cd secrets
   for s in db_superuser_password hsp_database_password keycloak_db_password \
            keycloak_admin_password hsp_oidc_client_secret; do
     openssl rand -base64 32 | tr -d '/+=\n' > "$s"
   done
   python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode(), end='')" \
     > hsp_session_encryption_key
   chmod 400 *
   chown 999 db_superuser_password keycloak_db_password      # postgres
   chown 10001 hsp_database_password hsp_session_encryption_key  # api, migrate
   chown 1000 keycloak_admin_password hsp_oidc_client_secret     # keycloak
   ```
   Some files are read by two containers (`hsp_database_password` by postgres and the API; `keycloak_db_password` by postgres and Keycloak; `hsp_oidc_client_secret` by the API and Keycloak). Give those a group both users share, with mode 440, or make them world-readable inside a `secrets/` folder that only root can open.
3. **TLS** (`HSP_WEB_TLS=on`): put the certificate (with its chain) and key in `tls/tls.crt` and `tls/tls.key`, readable by uid 101.
4. **Data:** `mkdir -p /var/lib/hsp` (or your `HSP_DATA_DIR`).
5. **Start:** `docker compose up -d`. Migrations run first; `docker compose ps` shows every service healthy after about a minute.
6. **First admin:** create a user in Keycloak's `hsp` realm and give them the `hsp-admin` role, from the admin console (open it with `HSP_KEYCLOAK_ADMIN_FROM`) or inside the container with `kcadm.sh`.
