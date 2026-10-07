# 0009 — Seating: fixed assignment and bookable seats

- **Date:** 2026-10-07
- **Status:** Accepted

## Context
Seats placed in a space need to be associated with people.

## Options considered
- **Both fixed + bookable** ✅
- Fixed assignment only
- Hot-desking first

## Decision
Every seat has an **allocation mode**:
- **Assigned:** permanently allocated to a person (or reserved for a unit).
- **Bookable:** reservable by eligible people for time slots.
- **Unavailable:** for example under maintenance.

## Consequences
- Booking eligibility is an authorization question (`can_book` in [0007](0007-2026-10-07-authorization-model.md)). For example, only members of the owning unit may book its hot desks.
- Bookings need conflict detection (no overlapping slots per seat, and optionally one seat per person per slot) enforced at the database level.
- Time zones are stored per site. Booking slots are stored in UTC.
- Rooms (meeting rooms) can reuse the same booking mechanism later.
