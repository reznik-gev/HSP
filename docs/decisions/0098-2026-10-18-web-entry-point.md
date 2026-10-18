# 0098 — The web entry point: TLS modes, compression, HSTS and the Keycloak console

- **Date:** 2026-10-18
- **Status:** Accepted
- **Refines:** [0060](0060-2026-10-08-reverse-proxy.md) (compression narrowed to gzip; TLS can also end in front of HSP), [0097](0097-2026-10-18-production-images.md)

## Context
[0060](0060-2026-10-08-reverse-proxy.md) made nginx HSP's single entry point: `/` is the frontend, `/api/` the API and `/auth/` Keycloak, with TLS, security headers and a maintenance page. [0097](0097-2026-10-18-production-images.md) put that nginx in the `hsp-web` image. Building it left a few open questions, which the owner decided below. Details marked *(Claude's choice)* are lower-confidence.

## Decisions

| Question | Options | Chosen | Why |
|---|---|---|---|
| Compression | **gzip only** / compile the Brotli module / another base image with Brotli | **gzip only** | The official nginx images have no Brotli module. Brotli would save maybe another 10–20 % on text, which matters little on a company network. API responses are gzipped on the fly, and the frontend files are gzipped once at build time and served as they are (`gzip_static`). This narrows 0060's "Gzip/Brotli". |
| A company proxy or load balancer in front | **Two modes, set by env** / TLS in `hsp-web` only | **`HSP_WEB_TLS=on` / `off`** | `on` (default): `hsp-web` terminates TLS, as 0060 says, and HTTP redirects to HTTPS. `off`: something in front terminates TLS (a company proxy, or a Kubernetes ingress later, [0097](0097-2026-10-18-production-images.md)). `hsp-web` then serves HTTP and trusts `X-Forwarded-For` and `X-Forwarded-Proto` only from the addresses in `HSP_TRUSTED_PROXIES`, so logs, audit and the API see the real client and scheme. |
| HSTS | **1 year, this host only** / with `includeSubDomains` / short at first | **`max-age=31536000`**, no `includeSubDomains`, no preload | It protects HSP's own host name and can't affect other internal sites under the same domain. It's sent only when `hsp-web` terminates TLS; with TLS off, the proxy in front decides. `HSP_HSTS=off` turns it off, e.g. while a first install still uses its self-signed certificate. |
| Rate limiting | Limit sign-in paths / also a broad API limit / **no nginx limits** | **No nginx limits; Keycloak's brute-force detection on** | Staff behind one company NAT share an address, so per-IP limits can throttle real people. Password guessing is handled where the passwords are: the `hsp` realm turns on Keycloak's brute-force detection *(numbers are Claude's choice: lockout after 10 failures, growing by a minute each time, up to 15 minutes)*. |
| Keycloak's admin console | **Closed by default, opened by env** / always open / never through `hsp-web` | **Closed unless `HSP_KEYCLOAK_ADMIN_FROM` lists networks** | `/auth/admin`, the `master` realm and Keycloak's welcome page answer 404 by default, so the most powerful sign-in in the system isn't open to every employee's network. `HSP_KEYCLOAK_ADMIN_FROM=10.20.0.0/16,…` opens them for those networks (403 for everyone else). Operators can also reach Keycloak directly on the host; the `hsp` command will help with that. |

### Details *(Claude's choice)*
- **Ports:** 8080 for HTTP (the app with TLS off, or the redirect with TLS on), 8443 for HTTPS, 8081 for the health check. The redirect goes to `HSP_PUBLIC_URL`, so it's right whatever port the host maps.
- **TLS:** Mozilla's "intermediate" profile: TLS 1.2 and 1.3 and its cipher list. The certificate and key are files named by `HSP_TLS_CERT` and `HSP_TLS_KEY`. With TLS on and no certificate, `hsp-web` refuses to start and says why. The self-signed certificate of a first install is made by `hsp install` ([0060](0060-2026-10-08-reverse-proxy.md)).
- **Content-Security-Policy** on HSP's own responses: everything from HSP's own origin only, no framing (`frame-ancestors 'none'`), no plugins. Scripts must come from files; inline **styles** are allowed, because the plan view renders `<style>` elements. Keycloak's pages keep the policy Keycloak sends. Also `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` and a `Permissions-Policy` that turns off camera, microphone and location.
- **Caching:** hashed files under `/assets/` are cached for a year, and `index.html` is never cached, so a new release shows on the next page load.
- **Maintenance:** while the API is down (an upgrade, [0056](0056-2026-10-08-upgrades-and-migrations.md)), `/api/` answers `503` with a Problem Details body (`…/problems/maintenance`) and `Retry-After`. While Keycloak is down, the sign-in pages show a short maintenance page in English and Hebrew. Upstreams are looked up per request, so `hsp-web` starts and answers even while they're down.
- **Request IDs:** a client's `X-Request-ID` is kept, or nginx makes one, and passes it to the API and Keycloak. nginx's access log is JSON lines on stdout with the same `request_id` ([0057](0057-2026-10-08-observability.md)).
- **Uploads** up to 12 MB pass through (imports are limited to 10 MB by the API).
- **Upstreams** are `HSP_API_UPSTREAM` (`api:8000`) and `HSP_KEYCLOAK_UPSTREAM` (`keycloak:8080`), resolved with `HSP_RESOLVER` (Docker's DNS, `127.0.0.11`; a cluster DNS on Kubernetes).

## Consequences
- One image covers both a standalone install and a site with its own proxy in front.
- No Brotli. If a customer ever needs it, it's added in the image without changing anything else.
- Keycloak's admin console needs a deliberate step to reach. That's documented for operators.
- Keycloak must be told it's behind a proxy (`KC_PROXY_HEADERS=xforwarded`) and its public URL (`KC_HOSTNAME`). The Compose file sets both.
