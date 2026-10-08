# 0023 — Primary unit rule: deepest unit wins

- **Date:** 2026-10-08
- **Status:** Accepted
- **Resolves:** open question in [0019](0019-2026-10-08-org-unit-source.md)

## Options considered
- AD attribute, with an HSP fallback
- **Deepest unit wins** ✅
- HSP admin chooses

## Decision
When a person is a member of several unit groups, their **primary** unit ([0006](0006-2026-10-07-org-hierarchy-model.md)) is the one **deepest in the unit tree**. All other memberships are secondary.

**Tie-break:** if several candidate units are equally deep, the person is flagged **"primary unit ambiguous"** in the admin console. Until it's resolved, the unit whose AD group ID sorts first is used, so results are deterministic. An admin can then set an **HSP-side override**, which persists until the person's memberships change.

## Consequences
- No AD schema or attribute changes are required.
- If the person's primary unit changes after a sync, a membership-change event is raised. Features that depend on the primary unit (for example default seat-ownership hints and reporting lines) react to it.
- Cross-functional people may get an unexpected primary unit. The override handles that, but frequent overrides signal that the AD group design should change.
