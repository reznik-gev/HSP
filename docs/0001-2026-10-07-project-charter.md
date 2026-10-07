# 0001 — Project charter & initial requirements

- **Date:** 2026-10-07
- **Status:** Accepted

## Summary
HSM (Human-Space Management) is a service that lets managers model their physical workspaces and the people who use them, and control who manages which part of each.

## Core capabilities
1. **Workspace modeling**
   - Define buildings, floors, rooms and zones with measurements accurate to 1 cm.
   - Place seats, desks, monitors and other devices at exact positions and orientations.
   - View and edit spaces in a 3D environment.
2. **People & organization**
   - Model the organization as a configurable hierarchy of units (company → division → department → team, or any custom levels).
   - Place people in custom-defined positions within that hierarchy.
3. **Delegated management**
   - Sub-organizations can be granted management permissions over, and ownership of, sub-spaces (for example, a department owns floor 3 and can arrange it independently).

## Process
- Every design dilemma is presented as options and decided with the product owner.
- Each decision gets its own numbered, dated record in `docs/` (see [README](README.md)).

## Out of scope (for now)
- Visitor management, HVAC/BMS integration, procurement and asset depreciation. These can be revisited in later decisions.
