# 0138 — A restore can bring back HSP's data alone, or Keycloak's alone

- **Date:** 2026-11-10
- **Status:** Accepted
- **Refines:** [0106](0106-2026-10-21-backups.md) (what a restore replaces), [0107](0107-2026-10-21-operator-cli.md) (`hsp restore`)

## Context
Each backup holds two databases: HSP's and Keycloak's ([0106](0106-2026-10-21-backups.md)). A restore always replaces both. That came up on 2026-11-10, while the owner and Claude discussed whether the demo (0136) could be restored from a backup instead of being seeded. In the dev stack, Keycloak's database is shared by every session. A restore of both would overwrite it for all of them. The demo stays on the seed. But the owner wants a restore that can pick one database, for operators too. One example is undoing a bad people import without touching sign-ins, or the other way round.

## Options considered
- **A restore that can bring back HSP's database alone, Keycloak's alone, or both** ✅. Both stays the default.
- Both databases always, as today. Simple, but an operator who needs one back loses the changes in the other since the backup.

## Decision
- **`hsp restore` and `hsp-backup restore` get a way to restore only HSP's database or only Keycloak's.** Restoring both stays the default. *(The owner's choice.)*
- **It's for later.** It isn't scheduled, and nothing changes now. *(The owner's choice.)*

## Consequences
- Not built yet. When it's built, settle these first:
  - How the choice is written: for example `--only hsp` or `--only keycloak`. *(Open.)*
  - What keeps the two in step. People in HSP are matched to Keycloak sign-ins by their external id or their email ([0027](0027-2026-10-08-v1-interim-people-and-access.md)). Restoring one side alone can leave a person without a sign-in, or a sign-in without a person. The restore could warn about such mismatches. *(Open.)*
  - The schema check: 0106's refusal of a backup from a newer HSP applies to HSP's database. It isn't decided whether it also applies when only Keycloak's is restored. *(Open.)*
  - The weekly restore test ([0106](0106-2026-10-21-backups.md)) would cover each way.
