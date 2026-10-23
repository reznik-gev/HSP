# 0116 — `/readyz` remembers only a ready answer from Keycloak

- **Date:** 2026-10-24
- **Status:** Accepted

## Context
[0105](0105-2026-10-21-metrics-and-tracing.md) (point 2) says `/readyz` asks for Keycloak's discovery document with a 2 s timeout, and keeps "the result" for 10 s, so frequent health checks don't load Keycloak. The API runs several worker processes ([0055](0055-2026-10-08-deployment-target.md)), and each keeps its own result.

The release test failed about one run in ten with `/readyz` answering 503 although Keycloak was up. A worker had asked while Keycloak was still starting and kept that answer for 10 s. Meanwhile another worker found Keycloak ready, Docker marked the API healthy, and the next request reached the worker that still said "not ready". The [investigation](../investigations/2026-10-24-flaky-release-tests.md) has the evidence.

## Options considered
| Option | Chosen | Why |
|---|---|---|
| Keep any answer for 10 s, as now | | A worker says "not ready" for up to 10 s after Keycloak is back, while other workers say "ready". |
| Keep the answer in one place all workers share | | A file or the database just for this: more to go wrong than the problem is worth. |
| **Keep only a ready answer; ask again after a not-ready one** | ✅ (Claude's choice) | Recovery shows on the next request, in every worker. While Keycloak is down, each check asks it again. That's one request per health check, each with the 2 s timeout, which Keycloak can take. |

## Decision
- `/readyz` keeps a **ready** answer from Keycloak for 10 s. A not-ready answer is not kept: the next check asks Keycloak again.
- The rest of 0105 point 2 stands.

## Consequences
- After Keycloak comes back, every worker says "ready" on its next check.
- While Keycloak is down, each `/readyz` call waits up to 2 s for it.
