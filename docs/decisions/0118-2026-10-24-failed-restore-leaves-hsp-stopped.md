# 0118 — A restore that fails partway leaves HSP stopped

- **Date:** 2026-10-24
- **Status:** Accepted
- **Refines:** [0107](0107-2026-10-21-operator-cli.md) (`hsp restore`: "stops the stack, runs `hsp-backup restore`, and starts it again")

## Context
`hsp restore <backup>` stops HSP, replaces HSP's and Keycloak's databases with the backup, and starts HSP again. 0107 doesn't say what happens when the restore fails. A restore can fail in two ways:
- **Refused before anything changed:** the backup isn't there, is damaged, comes from a newer HSP, or its target can't be read. The databases are as they were.
- **Failed partway:** PostgreSQL failed during the restore. A database may be half-restored, or HSP's may be restored and Keycloak's not.

## Options considered
| Option | Chosen | Why |
|---|---|---|
| **Stay stopped; the message says how to go on** | ✅ (owner approved) | Nobody works on data that may be half-restored. The operator is at the keyboard, sees what failed, and chooses: fix it and restore again, or start HSP as it is. |
| Start HSP again anyway | | Less downtime, but people may see a mix of old and new data, or Keycloak may not match HSP. That's hard to notice and hard to undo. |
| Take a safety backup first, and put it back on failure | | HSP comes back unchanged, but the restore is slower and needs more disk. Putting the safety backup back can fail too. More to build and test before 1.0; a possible later improvement. |

## Decision
- `hsp restore` checks that the backup exists **before** asking or stopping anything. A mistyped name changes nothing.
- `hsp-backup` exits **3** when it refuses before changing anything. `hsp restore` then starts HSP again, as it was, and says the restore was refused.
- Any other failure leaves HSP **stopped**. The message says to fix the cause and run `hsp restore` again, or gives the command to start HSP as it is.

## Consequences
- A failed restore means downtime until an operator acts. Restores are rare and run by hand, so someone is there.
- `hsp-backup`'s exit codes are part of its interface with `hsp`: 0 worked, 3 refused before changing anything, 1 anything else.
