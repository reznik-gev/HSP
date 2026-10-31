# 0121 — The floor editor stays our own code, for now

- **Date:** 2026-10-31
- **Status:** Accepted
- **Keeps:** [0002](0002-2026-10-07-build-approach.md) (build from scratch), [0042](0042-2026-10-08-2d-renderer.md) and [0052](0052-2026-10-08-svg-commitment-and-performance-gate.md) (SVG, and an editor core of our own)

## Context
While reviewing #115, the owner asked why we build the editor's screens and interactions ourselves, and whether a ready-made editor could do it instead.

Building it ourselves was decided, but only part of the question was weighed:
- [0002](0002-2026-10-07-build-approach.md) chose to build HSP from scratch. The only ready-made editor it weighed was embedding draw.io.
- [0042](0042-2026-10-08-2d-renderer.md) compared drawing libraries (Konva, SVG, Three.js, PixiJS), not editors. It said: "Editor interactions are custom code."
- [0052](0052-2026-10-08-svg-commitment-and-performance-gate.md) recorded the owner's preference for SVG, and that the hard editor logic is the same whatever draws it.

No record weighed ready-made floor-plan editors. By now the editor is about 7,600 lines in `frontend/src/editor`, plus about 2,600 lines of tests.

## Options considered
Checked on 2026-10-31. These projects and their licences change, so check again before relying on this table.

| Option | What it is | Why not now |
|---|---|---|
| **Keep our own editor** ✅ | What we have | |
| react-planner (MIT) | The closest match: walls, doors and windows on walls, a catalog of items, 2D in SVG and 3D | The original hasn't changed since 2024; a TypeScript fork was updated in 2025. It has its own data model, and no drafts, locks, plan rules or seats. |
| Pascal Editor (MIT) | A 3D building editor in the browser: walls, rooms, levels, furniture | 3D first, still in beta, and its 2D floor plan view is new |
| tldraw | A toolkit for drawing and dragging, made to be extended | Not open source: production use needs a paid licence key. Generic shapes, no walls, and its own data store. |
| Excalidraw (MIT) | A whiteboard | Hand-drawn style, not exact geometry |
| FloorspaceJS (NREL) | A 2D floor-plan editor for energy modelling | Grid-based, and little activity |
| Smplrspace, Archilogic, Floorplanner | Commercial floor-plan SDKs | Hosted services, which [0005](0005-2026-10-07-deployment-model.md)'s on-premise, offline installs rule out |

## Decision
**We keep our own editor.** None of the options fits HSP as well as it needs to, especially for drafts and edit locks ([0016](0016-2026-10-08-edit-concurrency.md), [0081](0081-2026-10-10-drafts-and-changesets.md)). Each one would replace only the drawing, and we'd still own the parts that make it HSP's:
- drafts, autosave, the edit lock and publishing
- the plan rules shared with the server
- seat labels and seat numbering
- zones with types
- items attached to other items, and devices
- exact whole millimetres
- Hebrew, right to left

**To research later (the owner's note):** replacing parts of the editor with ready-made ones, and splicing them in, so we own less code. This is for the far future, with no date or trigger set.

## Consequences
- Editor work goes on in our own code, starting with the rest of [0108](0108-2026-10-21-first-client-demo-feedback.md)'s wall behaviours.
- The editor core stays independent of what draws it ([0052](0052-2026-10-08-svg-commitment-and-performance-gate.md)). That keeps it easier to swap in parts later.
- No change to HSP itself, so there's no changelog entry.
