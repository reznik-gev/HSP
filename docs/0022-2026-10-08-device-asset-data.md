# 0022 — Device asset data: light asset fields

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **Light asset fields** ✅
- Placement only
- Integrate with an IT asset management system (ITAM) or configuration management database (CMDB)

## Decision
Placed objects whose catalog item is a device may carry optional fields:
- `asset_tag`, `serial_number`, `notes`
- `assigned_person` (a person can "own" a device independently of the seat it sits on)

## Consequences
- HSP is **not** an ITAM system. It has no lifecycle states, procurement, warranty or depreciation (consistent with [0001](0001-2026-10-07-project-charter.md)).
- `asset_tag` is unique per tenant when set, so it can be searched ("where is monitor MON-0412?").
- Asset fields belong to the object's stable identity across floor versions ([0015](0015-2026-10-08-floor-plan-versioning.md)). A device moved to another floor keeps its tag and history.
- An external asset-system link (an external ID field per object) can be added later without changing the model.
