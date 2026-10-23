# 0111 — The API's CPU and memory come from the platform, not its own metrics

- **Date:** 2026-10-23
- **Status:** Accepted
- **Refines:** [0105](0105-2026-10-21-metrics-and-tracing.md) (item 3: "process CPU and memory")

## Context
[0105](0105-2026-10-21-metrics-and-tracing.md) lists "process CPU and memory" among the API's metrics. The API runs a launcher and several uvicorn workers, so Prometheus's standard process collector, which measures one process, can't report it. The first version (#102) added psutil and a collector that added up every process in the API's container. Review found that it was never recorded, and that it had real flaws:
- **The CPU counter could go down.** When a worker died and was replaced, its CPU time left the sum. Prometheus reads that as a restart and graphs a false spike.
- **Memory was overstated.** Adding up each process's memory counts shared memory once per worker.
- **The names misled.** `process_cpu_seconds_total` and `process_resident_memory_bytes` are the standard names for one process, and ready-made dashboards read them that way.
- **`process_count` wasn't the number of workers.** With 2 workers it reported 4, because Python adds a helper process.

HSP will also run on Kubernetes in 1.1 or 1.2 ([0104](0104-2026-10-21-v1-release-scope-and-support.md)), where the cluster already measures every container.

## Options considered
The owner chose:

| Option | Chosen | Why |
|---|---|---|
| Keep psutil, rename the metrics and drop `process_count` | | The falling CPU counter and overstated memory remain, and so does a dependency. |
| Read the container's own totals from Linux (cgroup v2) | | Accurate, with no dependency. But it needs cgroup v2 (Ubuntu 22.04+, Debian 11+, RHEL 9+), so RHEL 8 hosts would get nothing, and on Kubernetes it repeats what the cluster already reports. |
| **Leave CPU and memory to the platform** | ✅ | The usual practice for apps in containers: the app reports what only it knows (requests, errors, response times, its own events), and the platform reports resources. On Kubernetes, the cluster's own container metrics are what `kubectl top`, scaling and the standard dashboards use. On one Docker host, `docker stats` shows them, and cAdvisor turns them into Prometheus metrics. |

## Decision
- The API's metrics no longer include CPU, memory or a process count. Every other metric in [0105](0105-2026-10-21-metrics-and-tracing.md) item 3 stays.
- psutil is not a dependency.
- The operator guide (`deploy/install.md`) says where CPU and memory come from: `docker stats` on the host, and cAdvisor for an operator who wants them in Prometheus. HSP doesn't ship cAdvisor: it needs broad access to the host, which is the operator's call.

## Consequences
- An operator on 1.0 who collects only HSP's metrics must add cAdvisor, or use their usual host monitoring, to graph CPU and memory.
- On Kubernetes, nothing extra is needed.
- The backup service is a single process, so its metrics keep the Prometheus client's standard process metrics.
