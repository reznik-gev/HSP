# 0082 — Publish, discard and restore

- **Date:** 2026-10-10
- **Status:** Accepted. Proposed by Claude while the product owner was away, then reviewed by the owner choice by choice on 2026-10-12. Six choices were approved as proposed, and one (assigned seats) was changed.
- **Refines:** [0015](0015-2026-10-08-floor-plan-versioning.md), [0028](0028-2026-10-08-floor-version-storage.md), [0031](0031-2026-10-08-seat-assignment-rules.md), [0034](0034-2026-10-08-v1-data-model.md), [0081](0081-2026-10-10-drafts-and-changesets.md)

## Decisions
| Question | Options | Chosen | Why |
|---|---|---|---|
| Must publish name the revision being published? | **Yes, `base_revision`** / no | **Yes** | Prevents publishing changes the publisher hasn't seen, such as another tab's save. This is the same guard changesets use. |
| Does publishing need the edit lock? | **Yes** / no | **Yes** | Publishing is the final write of an editing session ([0016](0016-2026-10-08-edit-concurrency.md)). |
| What happens to the lock after publishing? | **Kept** / released | **Kept** | The editor can keep working. The next changeset starts a new draft ([0081](0081-2026-10-10-drafts-and-changesets.md)). The client releases the lock explicitly when the user closes the editor. |
| Restore while a draft exists | **Refused (409)** / overwrite the draft | **Refused** | Never silently throws away unsaved work. Discard first. |
| Validate a restored version? | **No (exact copy); publish re-checks** / yes | **No** | An old version should always be restorable, even if a rule changed since. The editor's checks and the publish checks still apply before it goes live. |
| Seats with assignments removed or switched away from `assigned` | Block publish (409) / unassign automatically / **warn, and the publisher confirms** | **Warn and confirm** (owner's choice; Claude had proposed blocking) | Publish is refused with a list of the affected seats. Sending the same publish with those seats in `unassign_seats` unassigns them in the same transaction. Each one is audited as `seat.unassigned`. Big re-layouts don't need a reassignment pass first, and nobody loses a seat without a person explicitly confirming it. This refines [0031](0031-2026-10-08-seat-assignment-rules.md), which required unassigning first. |
| Archived floors in label uniqueness | **Excluded** / included | **Excluded** | Archived floors are out of use ([0078](0078-2026-10-08-archive-semantics.md)). They're checked again when a floor is restored and republished. |

## Endpoints
| Endpoint | Behavior |
|---|---|
| `POST /floors/{id}/draft/publish` `{base_revision, note?}` | The draft becomes the **published** version, and the previous published version becomes **superseded**. `floor.published_version` = draft. Audited as `floor.published`. |
| `DELETE /floors/{id}/draft` | **Discards** the draft ([0028](0028-2026-10-08-floor-version-storage.md)): its revisions are deleted, revisions it closed are reopened, elements it created disappear, and the version row is deleted so numbering has no gaps ([0081](0081-2026-10-10-drafts-and-changesets.md)). Audited as `floor.draft_discarded`. |
| `POST /floors/{id}/draft/restore/{n}` | Creates a draft (`published + 1`) whose content is **exactly version *n***. Elements keep their stable ids ([0028](0028-2026-10-08-floor-version-storage.md)). Audited as `floor.draft_restored`. |

All three need hsp-admin, CSRF and the caller's edit lock (`409 lock-required` / `423 floor-locked`).

## Publish checks
They return `409 publish-conflicts`, listing every problem ([0037](0037-2026-10-08-api-errors.md)):

| Code | Rule |
|---|---|
| `seat_label_duplicate` | Seat labels are unique among seats in the **building**. The check covers this draft plus the published versions of the building's other active floors ([0034](0034-2026-10-08-v1-data-model.md) invariant 4). |
| `device_on_other_floor` | A device is placed on at most one floor: this draft against every other published floor of the tenant (invariant 5). |
| `assigned_seat_removed` / `assigned_seat_not_assignable` | A seat that has an assignment is removed or switched away from `assigned`. This blocks only until the publisher confirms the seat in `unassign_seats`. Confirmed ids that don't need unassigning are ignored. |
