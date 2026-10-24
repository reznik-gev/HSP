# 0119 — Recovering on a new host: `hsp install --secrets`, then `hsp restore`

- **Date:** 2026-10-24
- **Status:** Accepted
- **Refines:** [0107](0107-2026-10-21-operator-cli.md) (`hsp install`)

## Context
Backups never hold `secrets/` ([0106](0106-2026-10-21-backups.md)), so operators keep a copy of it themselves. To recover on a new host, they install HSP and restore a backup.

PostgreSQL sets its passwords from `secrets/` the first time it starts on an empty data folder. `hsp install` generates new secrets and starts it, so the passwords then come from those. Putting the saved `secrets/` back afterwards doesn't work: the restore logs in with the old superuser password and is refused, and so are the API and Keycloak. The first version of `install.md` gave those steps.

## Options considered
| Option | Chosen | Why |
|---|---|---|
| **`hsp install --secrets <saved secrets/>`, then `hsp restore`** | ✅ (owner approved) | The saved secrets are in place before PostgreSQL first starts. Two commands, and the weekly restore drill runs them. |
| Install, stop, empty PostgreSQL's folder, put `secrets/` back, start, restore | | Works with no new option, but it's more manual steps, at a stressful moment, and easier to get wrong. |
| A restore that adapts the data to the new host's own secrets | | Operators wouldn't need to keep `secrets/` at all. But the restore would set the database passwords, change HSP's client secret in Keycloak, and reset Keycloak's admin password, which needs its bootstrap mode. That reaches into Keycloak's internals, and any Keycloak upgrade could break it. Worth a look after 1.0. |
| Secrets in the backup, encrypted with a passphrase | | One file to keep instead of a folder, but it reverses 0106, which keeps secrets out of backups because their targets are often less protected. The passphrase becomes a new secret, and a guessed passphrase gives away both the data and the keys. |
| One command, `hsp install --from-backup <file>` | | Installs with the saved secrets, copies the backup in and restores, all at once. Only a shortcut over `--secrets`; it can be added later without changing anything. |

## Decision
- `hsp install --secrets DIR` copies a saved `secrets/` folder into the installation instead of generating new secrets. It refuses if a password or the session key is missing from `DIR`.
- To recover on a new host: install the same HSP version with `--secrets` and the old host's settings (`--no-admin`, since the restore brings back Keycloak's users), copy the backup file into the backups folder, and run `hsp restore`.
- The weekly restore test ([0106](0106-2026-10-21-backups.md)) also runs these steps: it installs again into a new folder with the saved secrets, restores, and checks the data and signing in.

## Consequences
- Operators must keep a copy of `secrets/`. Without it, a backup can't be restored on a new host. `install.md` says so where it lists the installation's files.
- A change that breaks recovery on a new host fails the weekly restore test.
