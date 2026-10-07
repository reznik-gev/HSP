# 0005 — Deployment: on-premise / self-hosted

- **Date:** 2026-10-07
- **Status:** Accepted

## Context
HSM could run in a managed cloud, on-premise, or both.

## Options considered
- Cloud (managed services)
- **On-premise / self-hosted** ✅
- Both (containerized, cloud-agnostic)

## Decision
HSM is deployed **on-premise in the organization's own infrastructure**.

## Consequences
- Every component must be self-hostable and redistributable. No dependency on proprietary cloud services (managed queues, cloud-only databases, SaaS auth).
- Deliverables are container images plus a reference deployment: Docker Compose for small sites, with a Helm chart possible later.
- 3D assets, fonts and JS libraries are bundled with the app rather than loaded from public CDNs, so air-gapped installs work.
- Backup/restore, upgrades/migrations and observability must be documented for customer operators.
- Together with [0003](0003-2026-10-07-tenancy-model.md), this keeps a later SaaS deployment possible because the same containers can run in a cloud.
