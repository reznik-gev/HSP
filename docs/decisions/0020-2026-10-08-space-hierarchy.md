# 0020 — Space hierarchy: fixed structural core + nestable zones

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **Fixed core + free zones** ✅
- Fully fixed (Site → Building → Floor → Room → Seat)
- Fully configurable levels

## Decision
```
Site            (address, time zone)
 └─ Building
     └─ Floor   (elevation, height, local coordinate origin — the unit of editing/versioning)
         └─ Zone*   (nestable; user-defined zone types: wing, room, pod, meeting room, …)
             └─ Placed objects (seats, desks, monitors, devices — see 0021)
```
- **Site, Building and Floor are fixed** because the geometry engine relies on them: a floor is the 2D plane that gets extruded ([0004](0004-2026-10-07-space-authoring-model.md)), the unit that gets locked ([0016](0016-2026-10-08-edit-concurrency.md)), and the unit that gets versioned ([0015](0015-2026-10-08-floor-plan-versioning.md)).
- **Zones** are polygons on a floor. They can nest (a pod inside a wing) and have a tenant-defined **zone type**. Rooms are zones of a type flagged "enclosed", whose boundary follows walls.
- Placed objects belong to a floor and are **spatially** assigned to the innermost zone containing them, computed with PostGIS ([0012](0012-2026-10-08-database.md)).

## Consequences
- Every level (site, building, floor, zone) is a `space` node in the OpenFGA model ([0007](0007-2026-10-07-authorization-model.md)), so ownership can be delegated at any level.
- Zones on a floor can't partially overlap with siblings. They must be either disjoint or strictly nested, which is validated on save and publish.
- Moving an object across a zone boundary changes which unit owns it. The editor warns about this.
