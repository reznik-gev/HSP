# Shared validation cases

Language-neutral test cases for floor-plan invariants
([0051](../../docs/decisions/0051-2026-10-08-validation-feedback.md), [0092](../../docs/decisions/0092-2026-10-15-editor-speed-tools.md)).
Both the TypeScript checker in the editor core (`frontend/src/editor/core/checks.ts`) and the
Python backend (`hsp.plans.changeset.validate`) run every case in CI, so the two can't drift
apart. A rule change updates the cases first; both implementations must then pass them.

## Format
One JSON file per rule or group of rules:
```json
{
  "rule": "furniture, seats and devices",
  "catalog": { "desk": { "id": "desk", "category": "desk", "is_seat": true, … } },
  "zone_types": ["room"],
  "devices": ["laptop-1"],
  "cases": [
    {
      "name": "a desk lifted off the floor",
      "plan": { "objects": [ … ] },
      "expect": [{ "code": "not_mountable", "element_id": "d1" }]
    }
  ]
}
```
- `plan` uses the API floor-plan shape ([0036](../../docs/decisions/0036-2026-10-08-floor-plan-io.md)): integer mm, decidegrees. Lists it leaves out are empty.
- `catalog`, `zone_types` and `devices` describe what exists outside the plan, for every case in the file. A case's plan can bring its own `catalog`.
- Ids are short names (`"w1"`, `"desk"`). The Python runner turns them into UUIDs, which its models need, and back.
- `expect` lists every finding the checkers must report, and no others; order doesn't matter. An empty list means the plan is valid. Findings are errors unless they say `"severity": "warning"`.
- The editor doesn't load every device, so it checks "device doesn't exist" only when given the list (the cases give it); the server always checks it.
