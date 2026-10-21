# 0104 — What 1.0.0 includes, which versions get fixes, and what comes right after

- **Date:** 2026-10-21
- **Status:** Accepted
- **Refines:** [0025](0025-2026-10-08-v1-scope.md) (v1 scope), [0057](0057-2026-10-08-observability.md) (the monitoring profile), [0064](0064-2026-10-08-branching-workflow.md) (the supported-versions policy), [0055](0055-2026-10-08-deployment-target.md) (Kubernetes later)

## Context
The first client demo went well ([feedback](../demos/feedback-2026-10-21.md)), and the owner wants to finish v1 and release **1.0.0**. Comparing the decisions with the code showed what's still missing for operators: backups, `bin/hsp`, metrics, tracing and a full `/readyz`. The client also asked for AD sync. [0064](0064-2026-10-08-branching-workflow.md) left one question for "before the first release": which versions get fixes.

## Decision
The owner decided:

1. **AD/LDAP sync of people and teams is not in 1.0.0.** It stays as decided in [0017](0017-2026-10-08-people-data-source.md) and [0019](0019-2026-10-08-org-unit-source.md), for a later release. Signing in with AD accounts through Keycloak already works ([0027](0027-2026-10-08-v1-interim-people-and-access.md)), and imported people carry an `external_id` that a sync can take over.
2. **The optional `monitoring` profile (Prometheus, Loki, Grafana) is not in 1.0.0.** The rest of [0057](0057-2026-10-08-observability.md) is: JSON logs, `/metrics`, tracing, `/healthz` and `/readyz` ([0105](0105-2026-10-21-metrics-and-tracing.md)).
3. **Before 1.0.0**, as one stack of PRs:
   - Monitoring: request logs, the full `/readyz`, `/metrics`, tracing ([0105](0105-2026-10-21-metrics-and-tracing.md)).
   - **The release version shown in the app** ([0063](0063-2026-10-08-release-versioning.md)): at the bottom of the user menu, as "HSP 1.0.0". It's the frontend's own version, set when `hsp-web` is built from the same `HSP_VERSION` as the other images. The owner chose not to compare it with the API's.
   - **ETags and `304 Not Modified`** on the polled reads of [0041](0041-2026-10-08-live-updates.md): the floor, its lock status and its seats. The ETag is a hash of the response body, so it works the same for every endpoint. The server still reads the database; what's saved is the download and the redraw. Responses carry `Cache-Control: private, no-cache`, so the browser asks with `If-None-Match` by itself. A published plan of a given version never changes, so it's cached for longer instead. 0041's polling isn't built yet, so it comes in the same PR: the lock every 15 s and the published version every 30 s, on the floor page.
   - Backups and a weekly restore test ([0106](0106-2026-10-21-backups.md)).
   - `bin/hsp` with `hsp upgrade` ([0107](0107-2026-10-21-operator-cli.md)).
   - The operator guide: install steps, hardware estimates and the support promise below.
4. **Which versions get fixes:** patches go mostly to the **latest 1.x** release. For anything else, such as a fix on an older version, help with an installation or a special request, customers can contact the owner of the project, for any reason. `release/X.Y` branches ([0064](0064-2026-10-08-branching-workflow.md)) are made only when such a fix is agreed.
5. **Right after 1.0.0:** **Kubernetes support in 1.1 or 1.2**, as soon as possible. It comes with a **CLI that can also manage HSP remotely**, including from a Windows workstation, for Kubernetes and for remote Docker hosts. For 1.0.0, `bin/hsp` runs on the Docker host itself ([0107](0107-2026-10-21-operator-cli.md)). The images are already ready for Kubernetes ([0097](0097-2026-10-18-production-images.md)).

## Consequences
- 1.0.0 still supports one Docker host only ([0055](0055-2026-10-08-deployment-target.md)).
- Operators who want dashboards bring their own Prometheus and Grafana, and point them at the metrics ports.
- The demo feedback (snapping, nudging by 1 cm, free seats, dark mode, ports and outlets) is discussed after this stack. It may add fixes before 1.0.0.
- [0059](0059-2026-10-08-supply-chain-security.md) set "before the first customer installation" as a time to revisit bundle signing and an SBOM. That's still open, separate from this record.
