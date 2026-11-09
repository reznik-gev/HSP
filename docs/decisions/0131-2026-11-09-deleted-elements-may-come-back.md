# 0131 — A deleted element may come back with its own id

- **Date:** 2026-11-09
- **Status:** Accepted
- **Refines:** [0081](0081-2026-10-10-drafts-and-changesets.md) (the `duplicate_id` rule)
- **Relates to:** [0028](0028-2026-10-08-floor-version-storage.md) (version-range rows), [0050](0050-2026-10-08-undo-redo.md) (undo/redo)

## Context
In the demo (Floor 3, draft 3), deleting a wall that was already published and then pressing Ctrl+Z failed. Undo sends the inverse changeset: it adds the wall and its doors back with their own ids ([0050](0050-2026-10-08-undo-redo.md)). The server refused it with `duplicate_id`, because it treated every id used in any version as taken for good. The wall still exists in the published version, so its id was "used".

[0081](0081-2026-10-10-drafts-and-changesets.md) says an `add` that "reuses an existing id" is refused. It doesn't say what "existing" means for an element that the draft deleted. [0050](0050-2026-10-08-undo-redo.md) says undoing past an autosave must work. Restoring an old version ([0028](0028-2026-10-08-floor-version-storage.md)) already brings old elements back with their ids.

The options:
- **Let an element of this floor come back, as the same kind, with its id** ✅. It gets a new revision row, starting in the draft. The storage allows it: 0028's exclusion constraint only forbids two revisions of one element valid in the same version.
- **Make undo give the element a new id.** Undo would no longer give back the same plan: anything that points at the element's id, such as a seat's assignments, history and links, would lose it.

## Decision
An `add` with an id the draft doesn't have is accepted when that id belongs to an element **of this floor and of the same kind**: one deleted in this draft, or in an older version. It comes back as a new revision of the same element. An id of another floor's element, or of an element of another kind, is still refused with `duplicate_id`.

This is my own choice (Claude), not the owner's: it is what 0050 and 0028 already imply, and users only notice that undo works.

## Consequences
- Undoing a delete works for published elements too, including the openings that went with a wall.
- Ids stay unique across floors, so an element never moves to another floor by id.
