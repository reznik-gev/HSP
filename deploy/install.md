# Installing and running HSP

This guide is for the person who installs HSP and keeps it running. It ships in every release bundle as `docs/install.md`. HSP runs as a Docker Compose stack on one Linux host ([0055](https://github.com/reznik-gev/HSP/blob/main/docs/decisions/0055-2026-10-08-deployment-target.md)). One command, `hsp`, installs, upgrades, backs it up and restores it ([0107](https://github.com/reznik-gev/HSP/blob/main/docs/decisions/0107-2026-10-21-operator-cli.md)).

## What you need

### A host
- **Linux on x86_64 (amd64).** HSP's images are built for amd64 only.
- **Docker Engine with the Compose plugin**, plus `openssl`, `tar` and `sha256sum`. HSP is tested on **Ubuntu 24.04 LTS with Docker Engine 28.0 and Compose 2.38**: use these versions or newer. Other distributions, or older versions, may work, but aren't tested.
- **Root**, or `sudo`, for `hsp install`, `upgrade`, `backup`, `restore` and `rollback`.
- **No internet access is needed.** Everything comes in the bundle, and no registry is contacted ([0054](https://github.com/reznik-gev/HSP/blob/main/docs/decisions/0054-2026-10-08-release-distribution.md)).

### Hardware
For an organisation of up to about **1,000 people**:

| | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| Memory | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB, plus room for backups kept on the host |

These leave plenty of headroom over what was measured on a 4 vCPU, 16 GB host (Ubuntu 24.04, HSP 1.0):
- **Memory:** about 1.1 GB idle, and 1.2 GB at its peak while four users at once signed in, searched, and edited and published floors. Keycloak takes most of it (630–680 MB), then the API with its 4 workers (310–330 MB), PostgreSQL (80–95 MB), the backup service (40 MB) and the web server (under 10 MB).
- **CPU:** at that peak, the API used up to 55% of one CPU and Keycloak 22%; idle, almost nothing.
- **Disk, for 1,000 people at 1,000 desks:** the databases take 34 MB (HSP 20 MB, Keycloak 14 MB), PostgreSQL's folder 89 MB, and one backup under 1 MB. Each further 1,000 people add roughly that much again. The images of one release take about 2 GB.

Beyond about 5,000 people, or for many people editing at once, start with the recommended host and watch the metrics (see [Every day](#every-day)); more CPU helps most, and `HSP_API_WORKERS` can then go up with it. Larger sizes aren't tested yet: ask the owner of the project.

### Network
- **A DNS name** users reach HSP by, such as `hsp.example.com`, and **ports 80 and 443** open to them. HTTP only redirects to HTTPS.
- **A TLS certificate** for that name, with its chain, and its key. Without one, `hsp install` makes a self-signed certificate so you can try HSP, but browsers warn about it.
- **Behind your own reverse proxy or load balancer** instead: HSP then serves plain HTTP, and the proxy terminates TLS (see [Settings](#settings): `HSP_WEB_TLS=off`).

## Install
1. Download `hsp-<version>.tar.gz` and its `.sha256` file from the [Releases page](https://github.com/reznik-gev/HSP/releases), and copy them to the host.
2. Check and unpack it:
   ```bash
   sha256sum -c hsp-<version>.tar.gz.sha256
   tar -xzf hsp-<version>.tar.gz
   ```
3. Install it:
   ```bash
   sudo ./hsp-<version>/bin/hsp install
   ```
   It asks for:
   - **where users reach HSP**, e.g. `https://hsp.example.com`
   - **whether HSP serves HTTPS itself** (`on`) or a proxy in front does (`off`)
   - **the first admin's email and name**

   It then checks the bundle's checksums, loads the images, and writes the installation to `/opt/hsp`. It generates the secrets, starts HSP and waits until every service is healthy, which takes one to three minutes. Finally it creates the first admin and prints their one-time password.
4. **Use your certificate**, unless a proxy terminates TLS: copy the certificate (with its chain) to `/opt/hsp/tls/tls.crt` and the key to `/opt/hsp/tls/tls.key`, then run `sudo docker compose --project-directory /opt/hsp restart web`. Or pass `--tls-cert` and `--tls-key` to `hsp install`.
5. **Sign in** at your URL as the first admin. Keycloak asks for a new password at the first sign-in.

To script it, every answer has a flag (`hsp install --help`):
```bash
sudo ./hsp-<version>/bin/hsp install --public-url https://hsp.example.com --tls on \
  --tls-cert hsp.crt --tls-key hsp.key --admin-email dana@example.com --admin-name "Dana Levi" \
  --set HSP_KEYCLOAK_ADMIN_FROM=10.0.0.0/8
```

### What's where
| Path | What |
|---|---|
| `/opt/hsp/.env` | Settings (see [Settings](#settings)) |
| `/opt/hsp/backups.yml` | Backup schedules and targets (see [Backups](#backups)) |
| `/opt/hsp/secrets/` | Generated passwords and keys, one file each, readable only by root. **Keep a copy somewhere safe:** backups never include them. |
| `/opt/hsp/tls/` | The TLS certificate and key |
| `/opt/hsp/bin/hsp` | The `hsp` command |
| `/var/lib/hsp/postgres` | The database |
| `/var/lib/hsp/backups` | Backups, by default |

`--dir` and `--data-dir` choose other places.

## Signing in, and Active Directory
People sign in through Keycloak, which comes with HSP at `/auth`. Admins have Keycloak's `hsp-admin` role. Everyone else who can sign in can look up floors and seats.

To let people sign in with their **Active Directory or LDAP** accounts, connect Keycloak's `hsp` realm to your directory (*User federation → LDAP*) in Keycloak's admin console. The console is closed by default. Open it to your admins' network with `HSP_KEYCLOAK_ADMIN_FROM` in `.env`, then sign in at `https://<your host>/auth/admin/` as `admin` with the password in `/opt/hsp/secrets/keycloak_admin_password`. HSP 1.0 doesn't sync people and teams from the directory; import them from a CSV or Excel file under **People** ([0104](https://github.com/reznik-gev/HSP/blob/main/docs/decisions/0104-2026-10-21-v1-release-scope-and-support.md)).

## Every day
- **`hsp status`** shows the version, each service's health, the last backup of each schedule (and any failure since), and free disk.
- **Logs:** `sudo docker compose --project-directory /opt/hsp logs -f api`, or `web`, `keycloak`, `postgres`, `backup`. The API writes one JSON line per request, with the route, status, time taken and the user's Keycloak ID. `HSP_LOG_LEVEL=DEBUG` adds the full path. Docker keeps 5 files of 10 MB per service.
- **Metrics,** for Prometheus ([0105](https://github.com/reznik-gev/HSP/blob/main/docs/decisions/0105-2026-10-21-metrics-and-tracing.md)): the API's on `127.0.0.1:9464` and the backups' on `127.0.0.1:9465`, reachable only from the host itself. To scrape from another machine, set `HSP_METRICS_ADDRESS` to an internal interface's address, and keep those ports closed to users. They hold no personal data. Worth alerting on:
  - **A backup that's too old:** `time() - hsp_backup_last_success_timestamp_seconds > 26 * 3600`, for nightly backups.
  - **A failed backup:** `hsp_backup_last_failure_timestamp_seconds > hsp_backup_last_success_timestamp_seconds`.
  - **Errors:** `rate(hsp_http_requests_total{status=~"5.."}[5m]) > 0`.
  - **HSP down:** the scrape fails (`up == 0`).
  - **A full disk:** from your host monitoring.
- **CPU and memory** come from Docker, not from HSP's metrics ([0110](https://github.com/reznik-gev/HSP/blob/main/docs/decisions/0110-2026-10-23-cpu-and-memory-from-the-platform.md)). `sudo docker stats` shows each service live. To graph them in Prometheus, run [cAdvisor](https://github.com/google/cadvisor) on the host, or use your usual host monitoring. HSP doesn't include cAdvisor, because it needs broad access to the host.
- **Traces:** OpenTelemetry, off until you set `OTEL_EXPORTER_OTLP_ENDPOINT` to your collector's OTLP/HTTP address. 10% of requests are sampled unless `OTEL_TRACES_SAMPLER` says otherwise.
- **Readiness:** the API's health check is `/readyz`. It's ready when the database answers, its schema matches this version, and Keycloak answers. `hsp status` shows the result.

## Backups
The `backup` service backs up HSP's and Keycloak's databases on the schedules in `/opt/hsp/backups.yml`, to a folder or to S3 ([0106](https://github.com/reznik-gev/HSP/blob/main/docs/decisions/0106-2026-10-21-backups.md)). By default it keeps **7 nightly and 4 weekly backups** in `/var/lib/hsp/backups`, on the same disk as the database. **Add a target on another machine** (an NFS or SMB mount, or S3) so a lost host doesn't take its backups with it. The comments in `backups.yml` explain every setting.

- **Each backup is one file**, `hsp-<UTC time>-<schedule>.tar`: both databases, the HSP version and checksums. With `include_config`, it also holds `.env`, `backups.yml` and `compose.yml`. **Never `secrets/`.**
- **They hold personal data** (names, emails, seats). Keep the target encrypted and its access limited.
- **Change the schedules** in `backups.yml`, check them with `sudo docker compose --project-directory /opt/hsp exec backup hsp-backup check`, and apply them with `... restart backup`.
- **S3 or MinIO:** add a target with `type: s3`, and put the keys in `secrets/backup_s3_access_key` and `secrets/backup_s3_secret_key`.
- **`sudo hsp backup now`** takes one, and **`sudo hsp backup list`** lists them all.
- **`sudo hsp restore <backup>`** replaces both databases with a backup. Everything changed since is lost, and HSP is down while it runs. A backup made by a newer HSP than the one installed is refused.

**Recovering on a new host:** install the same HSP version with `hsp install`, put your saved `secrets/` and `.env` back in `/opt/hsp`, copy the backup file into its backups folder, and run `hsp restore`.

## Upgrading
Releases follow MAJOR.MINOR.PATCH ([0063](https://github.com/reznik-gev/HSP/blob/main/docs/decisions/0063-2026-10-08-release-versioning.md)). You can skip any number of MINOR and PATCH releases, but not a MAJOR one: go from 1.x to 3.x through 2.x. Read the release notes (`docs/release-notes.md` in the bundle) first.

```bash
sha256sum -c hsp-<new version>.tar.gz.sha256 && tar -xzf hsp-<new version>.tar.gz
sudo ./hsp-<new version>/bin/hsp upgrade       # --dir if the installation isn't in /opt/hsp
```
Run the **new** release's `hsp`. It does these steps:
1. It takes a backup first, and stops there if that fails.
2. It keeps the current release's files for a rollback.
3. It stops HSP for a few minutes, and users see that it's being updated.
4. It updates the database and starts the new release.

`.env` keeps every value you set; new settings get their defaults and are listed. `backups.yml` isn't touched.

**If something goes wrong,** `sudo /opt/hsp/bin/hsp rollback` brings back the previous release with its data from that backup. Everything changed since the upgrade is lost. Old images stay on the host (about 1.2 GB per release; PostgreSQL's image is usually shared). Once you're sure you won't roll back, `sudo docker image prune -a` removes the unused ones.

## Settings
`/opt/hsp/.env`. Apply a change with `sudo docker compose --project-directory /opt/hsp up -d`.

| Setting | Default | What |
|---|---|---|
| `HSP_PUBLIC_URL` | (asked) | Where users reach HSP, without a trailing slash |
| `HSP_WEB_TLS` | `on` | `on`: HSP serves HTTPS with `tls/`. `off`: a proxy in front does, and HSP serves HTTP |
| `HSP_TRUSTED_PROXIES` | (none) | With `HSP_WEB_TLS=off`: your proxy's addresses or CIDRs |
| `HSP_HSTS` | `on` | Tell browsers to use HTTPS only (a year, this host only) |
| `HSP_BIND_ADDRESS` | `0.0.0.0` | The host address the ports are published on |
| `HSP_HTTP_PORT`, `HSP_HTTPS_PORT` | `80`, `443` | The published ports |
| `HSP_KEYCLOAK_ADMIN_FROM` | (none) | Networks allowed to open Keycloak's admin console |
| `HSP_DATA_DIR` | `/var/lib/hsp` | The database and the default backups folder |
| `HSP_API_WORKERS` | `4` | API processes; see [Hardware](#hardware) |
| `HSP_METRICS_ADDRESS` | `127.0.0.1` | Where the metrics ports listen |
| `HSP_API_METRICS_PORT`, `HSP_BACKUP_METRICS_PORT` | `9464`, `9465` | The metrics ports |
| `HSP_LOG_LEVEL` | `INFO` | `DEBUG` adds full paths to the API's logs |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (none) | Turns tracing on; the other standard `OTEL_*` settings work too |
| `HSP_VERSION` | (the release) | Set by `hsp install` and `hsp upgrade`; don't change it by hand |

## Support
**Fixes go mostly to the latest 1.x release.** Upgrading to it is the usual way to get a fix ([0104](https://github.com/reznik-gev/HSP/blob/main/docs/decisions/0104-2026-10-21-v1-release-scope-and-support.md)). For anything else, such as a fix for an older release, help with an installation or upgrade, or any other request, **contact the owner of the project**, whatever the reason. Report a security problem privately, as [SECURITY.md](https://github.com/reznik-gev/HSP/blob/main/SECURITY.md) explains.

When you ask for help, include the output of `hsp status` and the logs of the service that's failing.

## When something's wrong
- **`hsp install` or `hsp upgrade` says the stack didn't become healthy:** it prints the services' states and their last log lines. The `api` log names a failed check, such as `keycloak: Keycloak unreachable`; Keycloak's first start can take a few minutes.
- **The API won't start, and says to run the migrate job:** its database is from another version. `sudo docker compose --project-directory /opt/hsp up -d` runs the migrate job first. After a failed upgrade, use `hsp rollback`.
- **Users see "HSP is being updated":** the API is down. `hsp status` shows which service isn't healthy.
- **Backups fail:** `hsp status` shows since when. `sudo docker compose --project-directory /opt/hsp logs backup` says why. `hsp-backup check` (under [Backups](#backups)) tests the file and every target.
