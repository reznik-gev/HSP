# 0038 — API authentication: backend-for-frontend with session cookies

- **Date:** 2026-10-08
- **Status:** Accepted
- **Builds on:** [0008](0008-2026-10-07-identity-provider.md), [0027](0027-2026-10-08-v1-interim-people-and-access.md)

## Options considered
- SPA + PKCE bearer tokens held in browser JS
- **Backend-for-frontend (BFF) with HttpOnly cookies** ✅
- Both (BFF + bearer for machine clients)

## Decision
- FastAPI acts as a **confidential OIDC client** of Keycloak (Authorization Code flow + PKCE).
  - `/api/v1/auth/login` redirects to Keycloak.
  - `/auth/callback` exchanges the code, stores the tokens **server-side**, and sets a session cookie.
- The cookie is `HttpOnly; Secure; SameSite=Lax; Path=/` and holds only an opaque session ID. Access and refresh tokens **never reach browser JavaScript**.
- Sessions are stored in a PostgreSQL `user_session` table. The server refreshes access tokens transparently. Logout revokes the refresh token and ends the Keycloak session (RP-initiated logout).
- **CSRF protection:** state-changing requests must carry an `X-CSRF-Token` header that matches a per-session token from `/auth/me` (synchronizer token). `SameSite=Lax` is a second layer.
- The frontend and API are served from the **same origin** (reverse proxy in `/deploy`), so no CORS configuration is needed.
- Authorization ([0027](0027-2026-10-08-v1-interim-people-and-access.md)) reads realm roles from the stored token claims.

## Consequences
- An XSS bug can't exfiltrate tokens. It can still act within the session, so a strict Content-Security-Policy is still required.
- Sessions are server state, but stored in Postgres, so any API worker can serve any request.
- **Machine clients** (future connectors) aren't covered. When they arrive, a later decision can add bearer-token acceptance for service accounts (the "Both" option).
- Local development needs Keycloak running, which the dev Compose file provides.
