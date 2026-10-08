# Security policy

## Supported versions

HSP is **pre-release** (0.1.0) and has no published releases yet, so there is no supported version to patch.

Once 1.0 ships, security fixes are expected to go to the latest MINOR release, with hotfix branches for older versions as described in [0064](docs/decisions/0064-2026-10-08-branching-workflow.md). The exact supported-versions policy will be defined before the first release.

## Reporting a vulnerability

**Do not open a public issue, pull request or discussion for a security problem.**

Report it privately through GitHub's private vulnerability reporting: open the repository's **Security** tab and click **Report a vulnerability**. This is the only reporting channel.

Please include, as far as you can:

- the affected component (backend, frontend, deploy configuration, migrations) and the commit or version;
- a description of the issue and its impact;
- steps to reproduce, or a proof of concept;
- any suggested fix or mitigation.

Please don't access, modify or delete data that isn't yours, and don't test against installations you don't operate.

## What to expect

- We aim to acknowledge reports promptly. This is a best-effort goal, not a guaranteed response time.
- We will keep you updated in the private advisory while we confirm the issue and work on a fix.
- We follow **coordinated disclosure**: please keep the details private until a fix is available and an advisory has been published. We'll agree on the timing with you.
- If you'd like, you will be credited in the advisory.

## Scope

**In scope**: the HSP code and configuration in this repository:

- `backend/`: the FastAPI service, including authentication and authorization handling;
- `frontend/`: the React application;
- `deploy/` and the release bundle: Compose files, nginx and Keycloak configuration templates, and the operator CLI;
- database migrations.

Misconfiguration that HSP ships, such as an insecure default in a bundled nginx or Keycloak config, **is** in scope.

**Out of scope**:

- Vulnerabilities in third-party components themselves (Keycloak, PostgreSQL/PostGIS, nginx, Python or npm dependencies). Please report those upstream. If HSP needs to update or reconfigure a component in response, we'll still want to hear about it.
- The **development-only credentials** in [`deploy/dev/`](deploy/dev/), such as `admin/admin`, `viewer/viewer` and the client secret `dev-secret-change-me` in [`hsp-realm.json`](deploy/dev/keycloak/hsp-realm.json). They are intentionally public throwaway values for local development and are never used in production. Production secrets live only in the `.env` file on the host and are never committed ([0054](docs/decisions/0054-2026-10-08-release-distribution.md), [0068](docs/decisions/0068-2026-10-08-public-repository.md)).
- Issues that require an already compromised host or administrator access to it.

## Notes for operators

HSP is self-hosted on-premise software. The operator of each installation is responsible for:

- **TLS**: replacing the self-signed certificate generated at install time with a proper certificate, and renewing it ([0060](docs/decisions/0060-2026-10-08-reverse-proxy.md));
- **Host hardening**: OS patching, firewalling, Docker access and protecting the `.env` file;
- **Backup encryption**: backups contain personal data, so the backup target must be encrypted ([0058](docs/decisions/0058-2026-10-08-backups.md));
- **Upgrades**: applying HSP releases that contain security fixes.
