# 0057 — Observability: standard outputs + optional bundled stack

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **Standard outputs + optional stack** ✅
- Standard outputs only
- Always bundle a full stack

## Decision
**Always emitted by HSM:**
- **Logs:** structured JSON lines to stdout (structlog) with `timestamp`, `level`, `event`, `request_id` (same ID as in Problem Details ([0037](0037-2026-10-08-api-errors.md)) and audit events ([0033](0033-2026-10-08-audit-logging.md))), `actor_subject`, route and latency. No personal data beyond the subject ID.
- **Metrics:** Prometheus `/metrics` on an internal port (not exposed by nginx). It covers request rate, latency and errors per route, DB pool usage, changeset and publish counts and durations, lock contention, and backup age.
- **Traces:** OpenTelemetry (FastAPI, SQLAlchemy, httpx instrumentation), **off by default** and enabled by setting an OTLP endpoint.
- **Health:** `/healthz` (process alive) and `/readyz` (DB reachable, schema revision matches, Keycloak reachable).

**Optional `monitoring` compose profile:** Prometheus + Loki + Grafana, with prebuilt dashboards (API health, editor activity, backups) and basic alerts (API down, backup older than 26 h, disk above 85 %).

## Consequences
- Enterprises plug HSM into their existing tooling (Splunk, ELK, Datadog…) through standard formats.
- Sites with no monitoring get a working stack with one flag. Its images add to the bundle size ([0054](0054-2026-10-08-release-distribution.md)).
