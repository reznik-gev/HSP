# 0077 — Login implementation: Authlib, encrypted server-side sessions, Keycloak-driven lifetime

- **Date:** 2026-10-08
- **Status:** Accepted
- **Implements:** [0038](0038-2026-10-08-api-authentication.md) (backend-for-frontend with session cookies)

## Decisions
| Question | Options considered | Decision |
|---|---|---|
| OIDC library | **Authlib** ✅ / hand-rolled (httpx + joserfc) / Keycloak-specific wrapper | **Authlib**, async with httpx. It handles discovery, PKCE (S256), state and nonce, ID-token validation against JWKS, refresh and end-session. HSP speaks plain OIDC, not Keycloak-specific APIs ([0008](0008-2026-10-07-identity-provider.md)). |
| Tokens at rest | **Encrypt now** ✅ / plaintext for v1 | Access, refresh and ID tokens in `user_session` are **encrypted** with a key from `HSP_SESSION_ENCRYPTION_KEY` (Fernet, from the `cryptography` package). The cookie's session token is stored only as a SHA-256 hash. A leaked DB dump or backup ([0058](0058-2026-10-08-backups.md)) yields no usable tokens or sessions. |
| Tests | Mocked IdP + real Keycloak in CI / **mocked IdP only** ✅ / real Keycloak only | **Mocked IdP only.** Unit tests fake Keycloak's HTTP endpoints, including edge cases: bad `state`, expired refresh, revoked session, missing role. The real Keycloak is exercised manually against the dev stack. |
| Session lifetime | **Follow Keycloak** ✅ / fixed HSP lifetimes | **Keycloak decides.** An HSP session lasts as long as its refresh token can be refreshed, under Keycloak's SSO idle and max settings (by default 30 min idle, 10 h max). The session's `expires_at` tracks the refresh token's expiry, and the cookie gets the same lifetime. |

## Design details
- **Endpoints:**

  | Endpoint | Behaviour |
  |---|---|
  | `GET /api/v1/auth/login?next=/path` | Redirects to Keycloak. `next` must be a same-origin relative path. |
  | `GET /api/v1/auth/callback` | Exchanges the code, creates the session, sets the cookie, redirects to `next` |
  | `POST /api/v1/auth/logout` | Revokes the session, then returns Keycloak's end-session URL for the browser to visit |
  | `GET /api/v1/auth/me` | Returns subject, name, email, roles and the CSRF token |

- **Cookie:** `hsp_session`, an opaque random token. It's `HttpOnly`, `SameSite=Lax` and `Path=/`, and `Secure` everywhere except when `HSP_ENVIRONMENT=development` on plain-http localhost.
- **CSRF:** every state-changing request (anything other than GET, HEAD or OPTIONS) must send `X-CSRF-Token` matching the session's token ([0038](0038-2026-10-08-api-authentication.md)).
- **Roles:** come from the access token's `realm_access.roles`. `hsp-admin` grants editing ([0027](0027-2026-10-08-v1-interim-people-and-access.md)).
- **Refresh:** when the access token is within 30 s of expiring, the next request refreshes it. If the refresh fails (idle or max timeout, revoked), the session is deleted and the request gets a `401`.
- **Public URL:** redirect URIs are built from `HSP_PUBLIC_URL`, the origin users browse to: `http://localhost:5173` in dev through the Vite proxy, the nginx origin in production ([0060](0060-2026-10-08-reverse-proxy.md)).
- **Not in scope yet:** linking a logged-in user to a `person` record ([0027](0027-2026-10-08-v1-interim-people-and-access.md)), which comes with people import, and bearer tokens for machine clients ([0038](0038-2026-10-08-api-authentication.md)).

## Consequences
- A new required secret, `HSP_SESSION_ENCRYPTION_KEY`. Rotating it invalidates all sessions, which means everyone logs in again. That is acceptable.
- A bug in Keycloak configuration, or a realm export drifting from what HSP expects, is only caught by manual testing. Revisit adding a CI test against a real Keycloak if this bites.
