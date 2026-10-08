# Shared validation cases

Language-neutral test cases for floor-plan invariants
([0051](../../docs/decisions/0051-2026-10-08-validation-feedback.md)). Both the TypeScript editor core and
the Python backend run every case in CI, so the two implementations can't drift apart.

## Format
One JSON file per rule or rule group:
```json
{
  "rule": "opening_exceeds_wall",
  "cases": [
    {
      "name": "door ending past the wall end",
      "plan": { "walls": [ … ], "openings": [ … ] },
      "expect": [{ "code": "opening_exceeds_wall", "severity": "error", "element_id": "…" }]
    }
  ]
}
```
- `plan` uses the API floor-plan shape ([0036](../../docs/decisions/0036-2026-10-08-floor-plan-io.md)): integer mm, decidegrees.
- `expect` lists every finding the validators must report, and no others. An empty list means the plan is valid.

Cases are added together with the first validation rules.
