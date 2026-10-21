# 0105 — Request logs, readiness, metrics and tracing

- **Date:** 2026-10-21
- **Status:** Accepted
- **Refines:** [0057](0057-2026-10-08-observability.md) (observability), [0056](0056-2026-10-08-upgrades-and-migrations.md) (the schema check at startup)

## Context
[0057](0057-2026-10-08-observability.md) promised logs, metrics, tracing and health checks. Today the API writes JSON logs but no line per request, `/readyz` only checks the database, there's no `/metrics` and no tracing. The API runs 4 worker processes ([0099](0099-2026-10-18-production-compose.md)), and only `web` publishes ports.

## Options considered
The owner chose each of these:

| Question | Options | Chosen | Why |
|---|---|---|---|
| How a Prometheus outside the stack reaches `/metrics` | **A metrics port published by Compose** / through nginx, limited by IP / not published | **A metrics port** | Nothing goes through nginx and users never see it. |
| Is Keycloak part of "ready"? | **Yes** / reported only | **Yes** | As 0057 said. Without Keycloak nobody can sign in. |
| How tracing is set up | **The standard `OTEL_*` variables** / our own `HSP_*` settings / both HTTP and gRPC exporters | **Standard `OTEL_*`, HTTP only** | Familiar to anyone who runs OpenTelemetry. HTTP needs fewer dependencies than gRPC. |
| Raw paths in logs | Never / **only at debug level** | **Only with `HSP_LOG_LEVEL=DEBUG`** | Paths hold IDs and search text, which shouldn't be in normal logs. They help when debugging. |

## Decision
1. **A log line per request:** the event `request` with the method, the **route template** (`/api/v1/floors/{floor_id}`), the status, `duration_ms`, `request_id` and `actor_subject` (the Keycloak `sub` only). The raw path is added only at debug level. `/healthz`, `/readyz` and `/metrics` aren't logged. Uvicorn's own access log is off, so each request is logged once.
2. **`/readyz`** is ready only when:
   - the database answers,
   - the schema revision matches the code's Alembic head, and
   - Keycloak's OIDC discovery document answers (2 s timeout, the result kept for 10 s).

   Otherwise it answers `503` with Problem Details naming the check that failed. **At startup**, the API exits with a clear log line if the schema doesn't match ([0056](0056-2026-10-08-upgrades-and-migrations.md)).
3. **`/metrics`** in the Prometheus format, added up across the workers with the client's multiprocess mode. It has:
   - HTTP requests: a count and a latency histogram by method, route template and status
   - database connections in use
   - changesets and publishes: count and duration
   - edit-lock refusals (`409` and `423`)
   - process CPU and memory
4. **Publishing the metrics port:** Compose publishes it on `HSP_METRICS_ADDRESS`, **`127.0.0.1` by default**, so only the host itself can reach it. To let a Prometheus on another machine in, set it to an internal interface's address. The API's port is `HSP_API_METRICS_PORT` (9464). The backup service gets the next one ([0106](0106-2026-10-21-backups.md)). Host-only by default is my lower-confidence choice, made as the usual practice when the owner asked for it: Compose can't leave a port out when a variable is empty, and metrics hold no personal data.
5. **Tracing** is off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Compose passes the standard `OTEL_*` variables through. It exports over OTLP/HTTP. The service is `hsp-api` with the release version. Sampling defaults to parent-based at 10%. It instruments FastAPI and SQLAlchemy. It also covers calls to Keycloak if OpenTelemetry's httpx instrumentation works with `httpx2` ([0077](0077-2026-10-08-login-implementation.md)); otherwise that's a known gap.

## Consequences
- The API container needs a writable folder for the multiprocess metrics, emptied at each start.
- If Keycloak is down, the API counts as not ready. Docker doesn't restart it for that; it shows as unhealthy.
- An upgrade that forgot to migrate stops at once with a clear message instead of failing on the first request.
- New dependencies: `prometheus-client` and the OpenTelemetry SDK, its OTLP/HTTP exporter and instrumentations.
