# 0049 — Bulk layout tools: array, auto-numbering, cross-floor copy/paste

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered (multi-select)
- **Array / repeat** ✅
- **Auto-numbering labels** ✅
- Group / cluster templates ❌ (not in v1)
- **Copy/paste across floors** ✅

## Decision
**Array / repeat:**
- Duplicates the selection into **rows × columns** with an X/Y pitch (e.g. 2 × 6 at 160 × 180 cm), an optional mirror on alternate rows (back-to-back desk benches), and a live preview.
- Produces one changeset ([0036](0036-2026-10-08-floor-plan-io.md)).

**Auto-numbering:**
- Uses a pattern with a counter, e.g. `3-B-{01}` gives `3-B-01`, `3-B-02`, …
- Applied in click order, or by dragging a path across seats.
- Labels already used in the building are skipped or flagged, because labels are unique per building ([0034](0034-2026-10-08-v1-data-model.md)).

**Copy/paste across floors:**
- Copies the selected elements to a clipboard (in-app, with system clipboard as JSON), then pastes into another floor's **draft**, which requires holding that floor's lock.
- Paste offers "same coordinates" or "place at cursor".
- Pasted elements get **new IDs**. **Device links are dropped**, since a device is placed only once. **Seat labels are cleared** and flagged for renumbering.
- Openings are pasted only together with their host wall. Attached objects move with their host.

## Consequences
- These tools make repetitive floors (the same layout on floors 2–8) quick to draft, partly compensating for no underlay ([0048](0048-2026-10-08-no-plan-underlay.md)).
- Group templates can come later as a client-side feature without model changes.
