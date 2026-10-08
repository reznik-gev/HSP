# 0055 — Deployment target in v1: Docker Compose on a single host

- **Date:** 2026-10-08
- **Status:** Accepted
- **Refines:** [0005](0005-2026-10-07-deployment-model.md)

## Options considered
- **Docker Compose only** ✅
- Compose + Helm from day one
- Kubernetes (Helm) only

## Decision
- The supported v1 deployment is **one Linux host (VM or bare metal)** running Docker Engine with the Compose plugin.
- Services: `nginx` ([0060](0060-2026-10-08-reverse-proxy.md)), `frontend` (static assets served by nginx), `api` (FastAPI, multiple uvicorn workers), `keycloak`, `postgres` (PostGIS; separate databases for HSM and Keycloak), `backup` ([0058](0058-2026-10-08-backups.md)), plus a one-shot `migrate` job ([0056](0056-2026-10-08-upgrades-and-migrations.md)).
- Optional compose profile: `monitoring` ([0057](0057-2026-10-08-observability.md)).
- Reference sizing (to be validated): 4 vCPU, 8 GB RAM, 50 GB disk for one org with up to roughly 5,000 people.

## Consequences
- No high availability in v1. Recovery from host failure means restoring a backup onto a new host, so RTO is in hours and RPO is up to 24 h with nightly dumps.
- Helm/Kubernetes is added when a customer needs HA or cluster deployment, using the same images.
- A list of supported host OSes (e.g. RHEL 9, Ubuntu 24.04 LTS) is specified in the operator guide.
