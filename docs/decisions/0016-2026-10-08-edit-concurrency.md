# 0016 — Edit concurrency: exclusive edit lock per floor draft

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- Optimistic locking (conflict raised on save)
- **Exclusive edit lock** ✅
- Real-time co-editing (CRDT/WebSockets)

## Decision
Only **one person at a time** may edit a floor's draft ([0015](0015-2026-10-08-floor-plan-versioning.md)).

- Opening the editor **acquires a lock**, recording the holder and an expiry time.
- The client sends a **heartbeat** to extend the lock. If heartbeats stop (tab closed, crash), the lock **expires**. The default timeout is configurable, for example 15 minutes.
- Others see the floor as *"Being edited by <name> since <time>"* and get a read-only view.
- A user with sufficient permission (for example the owning unit's manager or an admin) can **force-release** the lock. The draft is preserved and the event is audited.
- Every write is checked against the lock holder on the server. As a safety net, writes also carry a version number.

## Consequences
- No real-time infrastructure (WebSockets or a Redis broker) is needed in v1. This resolves the open item in [0010](0010-2026-10-08-backend-stack.md).
- Locks are stored in PostgreSQL (lock row with an expiry), so they survive restarts and work across multiple API workers.
- Lock granularity is the whole floor. Finer granularity, such as per zone, can be revisited if contention appears.
