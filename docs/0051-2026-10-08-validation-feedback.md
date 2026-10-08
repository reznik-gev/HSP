# 0051 — Validation feedback: instant client preview, server is authoritative

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **Instant client preview + server truth** ✅
- Server-only validation

## Decision
- Geometry and invariant checks ([0034](0034-2026-10-08-v1-data-model.md), [0032](0032-2026-10-08-architectural-elements.md)) run **in the browser** while the user edits, so violations show immediately: red highlights, plus a problems panel listing errors and warnings.
- The **server re-validates every changeset** and is authoritative ([0036](0036-2026-10-08-floor-plan-io.md)). Errors use the same codes as the client ([0037](0037-2026-10-08-api-errors.md)).
- Severity:
  - **Errors** block saving the offending operation. Examples: partially overlapping zones, an opening past its wall end, an off-grid coordinate, a non-mountable object with z ≠ 0.
  - **Warnings** are allowed. Examples: a desk inside a door swing, an object overlapping a column, a seat without a label.
- Publish runs the full check set, including building-wide ones such as label uniqueness and single device placement.

## Keeping two implementations in sync
- The rules are implemented in **TypeScript** (frontend) and **Python** (backend, using Shapely/PostGIS).
- A shared, language-neutral suite of **JSON test cases** (`/shared/validation-cases/*.json`: input plan fragment → expected codes) runs in both test suites in CI. A rule change must update the cases, and both implementations must pass them.
- This adds a `/shared` directory to the monorepo layout ([0018](0018-2026-10-08-repository-layout.md)).

## Consequences
- Fast feedback while dragging, and the server never trusts the client.
- Twice the rule code. The shared cases are the guard against drift. Building-wide checks can run on the server only.
