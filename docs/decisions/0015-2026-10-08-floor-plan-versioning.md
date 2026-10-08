# 0015 — Floor-plan versioning: draft → publish

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **Draft → publish** ✅
- Live edits + audit log
- Scenarios (branches)

## Decision
- Each floor has one **published** version (what everyone sees and books against) and at most one **draft**.
- Editors change the draft. **Publishing** atomically makes the draft the new published version, and the previous version is kept as immutable history.
- History can be viewed, compared (diff of added, moved and removed objects) and **restored** into a new draft.

## Consequences
- Space objects keep a **stable identity** across versions, so a seat stays the same seat after it's moved. Bookings and assignments ([0009](0009-2026-10-07-seat-assignment-model.md)) reference the stable ID.
- On publish, the system detects conflicts with the future: for example, a removed seat with upcoming bookings or an assigned person. The publisher must resolve these, by reassigning, cancelling with notification, or blocking the publish.
- Publishing is a permissioned action (`can_publish`, added to the [0007](0007-2026-10-07-authorization-model.md) model). It can be stricter than `can_edit`.
- Scenario/branch planning stays possible later by allowing multiple drafts.
- Changes are audited at both the version and the object level.
