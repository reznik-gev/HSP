# 0072 — Rename the product from HSM to HSP (Human-Space Program)

- **Date:** 2026-10-08
- **Status:** Accepted

## Context
The product was named **HSM, "Human-Space Management"**. The product owner prefers **HSP, "Human-Space Program"**, a play on words that matches the repository name (`reznik-gev/HSP`). There are no releases, customers or production data yet, so renaming now is as cheap as it will ever be.

## Options considered
**Scope:**
- **Everything, including code identifiers** ✅
- Docs and user-facing text only
- Docs only

**Decision records:**
- **Rewrite in place + this record** ✅
- New record only, leaving old records untouched

## Decision
- The product name is **HSP** everywhere, expanded as **Human-Space Program**.
- **Code and configuration** were renamed throughout:

  | Before | After |
  |---|---|
  | Python package `hsm`, project `hsm` | `hsp` |
  | Scripts `hsm-api`, `hsm-export-openapi` | `hsp-api`, `hsp-export-openapi` |
  | Environment variables `HSM_*` | `HSP_*` |
  | Dev DB user and databases `hsm`, `hsm_test` | `hsp`, `hsp_test` |
  | Keycloak realm `hsm`, client `hsm-api`, role `hsm-admin`, `*@hsm.local` users | `hsp`, `hsp-api`, `hsp-admin`, `*@hsp.local` |
  | Problem type base `https://hsm.example/problems/` | `https://hsp.example/problems/` |
  | Planned operator CLI `bin/hsm` and bundle `hsm-<version>.tar.gz` | `bin/hsp`, `hsp-<version>.tar.gz` |
  | Compose project `hsm-dev`, image `hsm-api` | `hsp-dev`, `hsp-api` |

- **All decision records 0001–0071 were rewritten in place** to say HSP. Their decisions are unchanged.

## Amendment to the decision-log rules
Accepted records are still never edited in substance. **Pure renames** (the product name or identifiers, with no change to any decision) are an allowed exception. They must be recorded in a record like this one. Git history keeps the original wording.

## Consequences
- Existing developer environments must recreate the dev stack once, because the database user and realm names changed:
  ```bash
  docker compose -p hsm-dev down -v                 # remove the old stack and its seed-only data
  docker compose -f deploy/compose.dev.yml up -d
  cd backend && uv sync && uv run alembic upgrade head
  ```
  Also update any local `.env` from `HSM_*` to `HSP_*`.
- Git history, earlier commit messages and closed PR titles still say HSM. That's expected.
- The migration revision IDs are unchanged, so no database migration is needed for the rename itself.
