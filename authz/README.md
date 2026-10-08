# Authorization model (OpenFGA)

Placeholder. Relationship-based authorization with OpenFGA
([0007](../docs/decisions/0007-2026-10-07-authorization-model.md), [0013](../docs/decisions/0013-2026-10-08-rebac-engine.md))
is **deferred past v1** ([0025](../docs/decisions/0025-2026-10-08-v1-scope.md)). v1 uses admin-only editing
behind the same authorization interface ([0027](../docs/decisions/0027-2026-10-08-v1-interim-people-and-access.md)).

When delegated space ownership is built, this directory holds:
- `model.fga`: the OpenFGA DSL model (the sketch in 0007)
- `tests/*.fga.yaml`: model tests run in CI with `fga model test`
