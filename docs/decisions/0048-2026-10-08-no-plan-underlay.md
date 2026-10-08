# 0048 — Plan underlay (trace over image/PDF): not in v1

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- Image/PDF underlay with scale calibration
- **No underlay, draw from scratch** ✅

## Decision
v1 doesn't support uploading background floor-plan images or PDFs. Plans are drawn and typed from scratch.

## Consequences
- No file storage, upload handling or PDF rasterization in v1. This is consistent with no 3D uploads ([0021](0021-2026-10-08-object-catalog.md)).
- Onboarding existing buildings is slower. Precise inline entry ([0045](0045-2026-10-08-dimension-entry.md)) and copy/paste across floors ([0049](0049-2026-10-08-bulk-layout-tools.md)) partly offset this, for example by drawing one typical floor and pasting it into the others.
- **Revisit trigger:** if customer onboarding is the bottleneck, add an underlay as a per-floor, editor-only reference image that isn't part of the versioned plan.
