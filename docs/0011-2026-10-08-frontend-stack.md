# 0011 — Frontend stack: React + react-three-fiber

- **Date:** 2026-10-08
- **Status:** Accepted

## Context
The 2D-plan-to-3D editor ([0004](0004-2026-10-07-space-authoring-model.md)) is the most demanding UI in HSP.

## Options considered
- **React + react-three-fiber (R3F)** ✅
- Vue + TresJS
- Angular + Three.js
- Svelte + Threlte

## Decision
- **React + TypeScript** for the application UI.
- **Three.js via react-three-fiber + drei** for the 3D view.
- The 2D plan editor uses Canvas or SVG (Konva vs. plain SVG is decided during the editor spike).
- The API client and types are **generated from FastAPI's OpenAPI schema** (see [0010](0010-2026-10-08-backend-stack.md)).

## Consequences
- This is the largest ecosystem for web 3D, with plenty of examples and a deep hiring pool.
- All assets (3D models, fonts) are bundled locally for air-gapped on-prem installs ([0005](0005-2026-10-07-deployment-model.md)).
- The client renders the geometry rules the server validates. The server is authoritative.
- Build tooling, state management and the UI component library are left to a later decision.
