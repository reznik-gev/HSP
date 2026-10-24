# 0120 — Hardware sizes, measured for up to 5,000 people

- **Date:** 2026-10-24
- **Status:** Accepted
- **Refines:** [0055](0055-2026-10-08-deployment-target.md) (the reference sizing, "to be validated"), [0107](0107-2026-10-21-operator-cli.md) (disk per kept release)

## Context
0055 gave 4 vCPU, 8 GB and 50 GB as the host for up to roughly 5,000 people, to be validated. The first `install.md` was based on one run at 1,000 people. It gave that host for 1,000 and added a minimum, but said nothing between 1,000 and 5,000. 0107 put a kept release at about 0.7 GB of disk, which was the size of the compressed bundle.

The owner chose to measure up to 5,000 before 1.0. The sizing bench ([testing guide](../guides/testing.md)) does that on a clean 4 vCPU, 16 GB runner (Ubuntu 24.04). It installs the bundle and seeds an office where everyone has their own desk, 500 desks to a floor. Then it loads it with 4 users at once: the browser tests (sign in, edit and publish a floor, find a seat), then 80 look-ups of random people, each opening their seat on its floor.

## What was measured
| | 1,000 people | 5,000 people |
|---|---|---|
| Memory, idle | 1.1 GB | 1.1 GB |
| Memory, at the peak | 1.3 GB | 1.3 GB |
| Peak CPU (of one vCPU): API / Keycloak / PostgreSQL | 51% / 54% / 20% | 40% / 62% / 52% |
| HSP's database / Keycloak's | 20 MB / 14 MB | 28 MB / 14 MB |
| PostgreSQL's folder | 90 MB | 113 MB |
| One backup | 0.8 MB | 2.0 MB |

Keycloak takes most of the memory (670–730 MB), then the API with its 4 workers (325–350 MB), PostgreSQL (80–190 MB), the backup service (50 MB) and the web server (10 MB). Memory doesn't grow with the number of people; PostgreSQL's CPU does, a little. HSP's four images take about 1.2 GB, and PostgreSQL's 0.7 GB more, usually shared between releases.

## Options considered
| Option | Chosen | Why |
|---|---|---|
| **Measure at 5,000, and size for up to 5,000 from it** | ✅ (owner approved) | Checks 0055's number, and leaves no gap between 1,000 and 5,000. The bench can run again whenever the sizes need checking. |
| Recommend 0055's host up to 5,000 without measuring | | No work, but the guide would recommend something nobody had checked. |
| Support only what was measured, 1,000 people | | Honest, but mid-sized organisations would get no guidance. |

## Decision
For an organisation of **up to about 5,000 people**:

| | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| Memory | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB, plus room for backups kept on the host |

- Both leave wide headroom over the 1.3 GB and the CPU measured. The recommended host is 0055's, now measured.
- **Beyond about 5,000 people**, or for many people editing at once: not measured yet. Start with the recommended host, watch the metrics, and ask the project's owner. More CPU helps most, and `HSP_API_WORKERS` can then go up with it.
- **Tested versions:** Ubuntu 24.04 LTS with Docker Engine 28.0 and Compose 2.38. The guide states these instead of minimum versions nobody has checked.
- **Each kept release** takes about **1.2 GB** of disk (its four images), not 0.7 GB. PostgreSQL's image is usually shared.

## Consequences
- `install.md`'s *Hardware* section follows this record.
- Before the sizes change, the sizing bench runs again (Actions → sizing), and a new record supersedes this one.
