# Installing and running Musical Chairs

This guide is for the person who installs Musical Chairs and keeps it running. It ships in every release bundle as `docs/install.md`. Musical Chairs runs as a Docker Compose stack on one Linux host ([0055](https://github.com/reznik-gev/MusicalChairs/blob/main/docs/decisions/0055-2026-10-08-deployment-target.md)). One command, `musical_chairs`, installs, upgrades, backs it up and restores it ([0107](https://github.com/reznik-gev/MusicalChairs/blob/main/docs/decisions/0107-2026-10-21-operator-cli.md)).

## What you need

### A host
- **Linux on x86_64 (amd64).** Musical Chairs' images are built for amd64 only.
- **Docker Engine with the Compose plugin**, plus `openssl`, `tar` and `sha256sum`. Musical Chairs is tested on **Ubuntu 24.04 LTS with Docker Engine 28.0 and Compose 2.38**: use these versions or newer. Other distributions, or older versions, may work, but aren't tested.
- **Root**, or `sudo`, for `musical-chairs install`, `upgrade`, `backup`, `restore` and `rollback`.
- **No internet access is needed.** Everything comes in the bundle, and no registry is contacted ([0054](https://github.com/reznik-gev/MusicalChairs/blob/main/docs/decisions/0054-2026-10-08-release-distribution.md)).

### Hardware
For an organisation of up to about **5,000 people** ([0120](https://github.com/reznik-gev/MusicalChairs/blob/main/docs/decisions/0120-2026-10-24-hardware-sizes.md)):

| | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| Memory | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB, plus room for backups kept on the host |

These leave plenty of headroom over what was measured on a 4 vCPU, 16 GB host (Ubuntu 24.04), with offices of 1,000 and 5,000 people, each at their own desk, and 4 users at once signing in, editing and publishing floors, and looking people up:
- **Memory:** about 1.1 GB idle and 1.3 GB at its peak, for 1,000 people and for 5,000 alike. Keycloak takes most of it (670–730 MB), then the API with its 4 workers (325–350 MB), PostgreSQL (80–190 MB), the backup service (50 MB) and the web server (10 MB).
- **CPU:** at the peak, each used at most about half of one CPU: Keycloak up to 62%, PostgreSQL 52% and the API 51%. Idle, almost nothing.
- **Disk:** for 5,000 people, the databases take 42 MB (Musical Chairs 28 MB, Keycloak 14 MB), PostgreSQL's folder 113 MB, and one backup 2 MB. The images of one release take about 2 GB.

Beyond about 5,000 people, or for many people editing at once, sizes aren't measured yet: start with the recommended host, watch the metrics (see [Every day](#every-day)), and ask the owner of the project. More CPU helps most, and `MUSICAL_CHAIRS_API_WORKERS` can then go up with it.

### Network
- **A DNS name** users reach Musical Chairs by, such as `musical-chairs.example.com`, and **ports 80 and 443** open to them. HTTP only redirects to HTTPS.
- **A TLS certificate** for that name, with its chain, and its key. Without one, `musical-chairs install` makes a self-signed certificate so you can try Musical Chairs, but browsers warn about it.
- **Behind your own reverse proxy or load balancer** instead: Musical Chairs then serves plain HTTP, and the proxy terminates TLS (see [Settings](#settings): `MUSICAL_CHAIRS_WEB_TLS=off`).

## Install
1. Download `musical-chairs-<version>.tar.gz` and its `.sha256` file from the [Releases page](https://github.com/reznik-gev/MusicalChairs/releases), and copy them to the host.
2. Check and unpack it:
   ```bash
   sha256sum -c musical-chairs-<version>.tar.gz.sha256
   tar -xzf musical-chairs-<version>.tar.gz
   ```
3. Install it:
   ```bash
   sudo ./musical-chairs-<version>/bin/musical-chairs install
   ```
   It asks for:
   - **where users reach Musical Chairs**, e.g. `https://musical-chairs.example.com`
   - **whether Musical Chairs serves HTTPS itself** (`on`) or a proxy in front does (`off`)
   - **the first admin's email and name**

   It then checks the bundle's checksums, loads the images, and writes the installation to `/opt/musical_chairs`. It generates the secrets, starts Musical Chairs and waits until every service is healthy, which takes one to three minutes. Finally it creates the first admin and prints their one-time password.
4. **Use your certificate**, unless a proxy terminates TLS: copy the certificate (with its chain) to `/opt/musical_chairs/tls/tls.crt` and the key to `/opt/musical_chairs/tls/tls.key`, then run `sudo docker compose --project-directory /opt/musical_chairs restart web`. Or pass `--tls-cert` and `--tls-key` to `musical-chairs install`.
5. **Sign in** at your URL as the first admin. Keycloak asks for a new password at the first sign-in.

To script it, every answer has a flag (`musical-chairs install --help`):
```bash
sudo ./musical-chairs-<version>/bin/musical-chairs install --public-url https://musical-chairs.example.com --tls on \
  --tls-cert musical_chairs.crt --tls-key musical_chairs.key --admin-email dana@example.com --admin-name "Dana Levi" \
  --set MUSICAL_CHAIRS_KEYCLOAK_ADMIN_FROM=10.0.0.0/8
```

### What's where
| Path | What |
|---|---|
| `/opt/musical_chairs/.env` | Settings (see [Settings](#settings)) |
| `/opt/musical_chairs/backups.yml` | Backup schedules and targets (see [Backups](#backups)) |
| `/opt/musical_chairs/secrets/` | Generated passwords and keys, one file each, readable only by root. **Keep a copy somewhere safe:** backups never include them, and without them a backup can't be restored on a new host. |
| `/opt/musical_chairs/tls/` | The TLS certificate and key |
| `/opt/musical_chairs/bin/musical-chairs` | The `musical-chairs` command |
| `/var/lib/musical_chairs/postgres` | The database |
| `/var/lib/musical_chairs/backups` | Backups, by default |

`--dir` and `--data-dir` choose other places.

## Signing in, and Active Directory
People sign in through Keycloak, which comes with Musical Chairs at `/auth`. Admins have Keycloak's `musical-chairs-admin` role. Everyone else who can sign in can look up floors and seats.

To let people sign in with their **Active Directory or LDAP** accounts, connect Keycloak's `musical-chairs` realm to your directory (*User federation → LDAP*) in Keycloak's admin console. The console is closed by default. Open it to your admins' network with `MUSICAL_CHAIRS_KEYCLOAK_ADMIN_FROM` in `.env`, then sign in at `https://<your host>/auth/admin/` as `admin` with the password in `/opt/musical_chairs/secrets/keycloak_admin_password`. Musical Chairs 1.0 doesn't sync people and teams from the directory; import them from a CSV or Excel file under **People** ([0104](https://github.com/reznik-gev/MusicalChairs/blob/main/docs/decisions/0104-2026-10-21-v1-release-scope-and-support.md)).

## Every day
- **`musical-chairs status`** shows the version, each service's health, the last backup of each schedule (and any failure since), and free disk.
- **Logs:** `sudo docker compose --project-directory /opt/musical_chairs logs -f api`, or `web`, `keycloak`, `postgres`, `backup`. The API writes one JSON line per request, with the route, status, time taken and the user's Keycloak ID. `MUSICAL_CHAIRS_LOG_LEVEL=DEBUG` adds the full path. Docker keeps 5 files of 10 MB per service.
- **Metrics,** for Prometheus ([0105](https://github.com/reznik-gev/MusicalChairs/blob/main/docs/decisions/0105-2026-10-21-metrics-and-tracing.md)): the API's on `127.0.0.1:9464` and the backups' on `127.0.0.1:9465`, reachable only from the host itself. To scrape from another machine, set `MUSICAL_CHAIRS_METRICS_ADDRESS` to an internal interface's address, and keep those ports closed to users. They hold no personal data. Worth alerting on:
  - **A backup that's too old:** `time() - musical_chairs_backup_last_success_timestamp_seconds > 26 * 3600`, for nightly backups.
  - **A failed backup:** `musical_chairs_backup_last_failure_timestamp_seconds > musical_chairs_backup_last_success_timestamp_seconds`.
  - **Errors:** `rate(musical_chairs_http_requests_total{status=~"5.."}[5m]) > 0`.
  - **Musical Chairs down:** the scrape fails (`up == 0`).
  - **A full disk:** from your host monitoring.
- **CPU and memory** come from Docker, not from Musical Chairs' metrics ([0111](https://github.com/reznik-gev/MusicalChairs/blob/main/docs/decisions/0111-2026-10-23-cpu-and-memory-from-the-platform.md)). `sudo docker stats` shows each service live. To graph them in Prometheus, run [cAdvisor](https://github.com/google/cadvisor) on the host, or use your usual host monitoring. Musical Chairs doesn't include cAdvisor, because it needs broad access to the host.
- **Traces:** OpenTelemetry, off until you set `OTEL_EXPORTER_OTLP_ENDPOINT` to your collector's OTLP/HTTP address. 10% of requests are sampled unless `OTEL_TRACES_SAMPLER` says otherwise.
- **Readiness:** the API's health check is `/readyz`. It's ready when the database answers, its schema matches this version, and Keycloak answers. `musical-chairs status` shows the result.

## Backups
The `backup` service backs up Musical Chairs' and Keycloak's databases on the schedules in `/opt/musical_chairs/backups.yml`, to a folder or to S3 ([0106](https://github.com/reznik-gev/MusicalChairs/blob/main/docs/decisions/0106-2026-10-21-backups.md)). By default it keeps **7 nightly and 4 weekly backups** in `/var/lib/musical_chairs/backups`, on the same disk as the database. **Add a target on another machine** (an NFS or SMB mount, or S3) so a lost host doesn't take its backups with it. The comments in `backups.yml` explain every setting.

- **Each backup is one file**, `musical-chairs-<UTC time>-<schedule>.tar`: both databases, the Musical Chairs version and checksums. With `include_config`, it also holds `.env`, `backups.yml` and `compose.yml`. **Never `secrets/`.**
- **They hold personal data** (names, emails, seats). Keep the target encrypted and its access limited.
- **Change the schedules** in `backups.yml`, check them with `sudo docker compose --project-directory /opt/musical_chairs exec backup musical-chairs-backup check`, and apply them with `... restart backup`.
- **S3 or MinIO:** add a target with `type: s3`, and put the keys in `secrets/backup_s3_access_key` and `secrets/backup_s3_secret_key`.
- **`sudo musical-chairs backup now`** takes one, and **`sudo musical-chairs backup list`** lists them all.
- **`sudo musical-chairs restore <backup>`** replaces both databases with a backup. Everything changed since is lost, and Musical Chairs is down while it runs. A backup made by a newer Musical Chairs than the one installed is refused.

**Recovering on a new host** ([0119](https://github.com/reznik-gev/MusicalChairs/blob/main/docs/decisions/0119-2026-10-24-recovering-on-a-new-host.md)). You need the saved copy of the old host's `secrets/`, its settings (its `.env`) and the backup.
1. Install the **same Musical Chairs version** with the saved secrets and the old host's settings. `--no-admin`, because the restore brings back Keycloak's users:
   ```bash
   sudo ./musical-chairs-<version>/bin/musical-chairs install --secrets <saved secrets/> --no-admin --public-url https://musical-chairs.example.com ...
   ```
   The secrets must go in this way. Putting them back after an install doesn't work: PostgreSQL has already set its passwords from new ones.
2. With a folder target, copy the backup file in, owned by the backup service's user: `sudo install -o 999 -m 640 <backup file> /var/lib/musical_chairs/backups/`. With S3, set the target up in `backups.yml` again, and the backup is already there.
3. `sudo musical-chairs backup list` shows it; `sudo musical-chairs restore <backup>` restores it.

## Upgrading
Releases follow MAJOR.MINOR.PATCH ([0063](https://github.com/reznik-gev/MusicalChairs/blob/main/docs/decisions/0063-2026-10-08-release-versioning.md)). You can skip any number of MINOR and PATCH releases, but not a MAJOR one: go from 1.x to 3.x through 2.x. Read the release notes (`docs/release-notes.md` in the bundle) first.

```bash
sha256sum -c musical-chairs-<new version>.tar.gz.sha256 && tar -xzf musical-chairs-<new version>.tar.gz
sudo ./musical-chairs-<new version>/bin/musical-chairs upgrade       # --dir if the installation isn't in /opt/musical_chairs
```
Run the **new** release's `musical-chairs`. It does these steps:
1. It takes a backup first, and stops there if that fails.
2. It keeps the current release's files for a rollback.
3. It stops Musical Chairs for a few minutes, and users see that it's being updated.
4. It updates the database and starts the new release.

`.env` keeps every value you set; new settings get their defaults and are listed. `backups.yml` isn't touched.

**If something goes wrong,** `sudo /opt/musical_chairs/bin/musical-chairs rollback` brings back the previous release with its data from that backup. Everything changed since the upgrade is lost. Old images stay on the host (about 1.2 GB per release; PostgreSQL's image is usually shared). Once you're sure you won't roll back, `sudo docker image prune -a` removes the unused ones.

## Settings
`/opt/musical_chairs/.env`. Apply a change with `sudo docker compose --project-directory /opt/musical_chairs up -d`.

| Setting | Default | What |
|---|---|---|
| `MUSICAL_CHAIRS_PUBLIC_URL` | (asked) | Where users reach Musical Chairs, without a trailing slash |
| `MUSICAL_CHAIRS_WEB_TLS` | `on` | `on`: Musical Chairs serves HTTPS with `tls/`. `off`: a proxy in front does, and Musical Chairs serves HTTP |
| `MUSICAL_CHAIRS_TRUSTED_PROXIES` | (none) | With `MUSICAL_CHAIRS_WEB_TLS=off`: your proxy's addresses or CIDRs |
| `MUSICAL_CHAIRS_HSTS` | `on` | Tell browsers to use HTTPS only (a year, this host only) |
| `MUSICAL_CHAIRS_BIND_ADDRESS` | `0.0.0.0` | The host address the ports are published on |
| `MUSICAL_CHAIRS_HTTP_PORT`, `MUSICAL_CHAIRS_HTTPS_PORT` | `80`, `443` | The published ports |
| `MUSICAL_CHAIRS_KEYCLOAK_ADMIN_FROM` | (none) | Networks allowed to open Keycloak's admin console |
| `MUSICAL_CHAIRS_DATA_DIR` | `/var/lib/musical_chairs` | The database and the default backups folder |
| `MUSICAL_CHAIRS_API_WORKERS` | `4` | API processes; see [Hardware](#hardware) |
| `MUSICAL_CHAIRS_METRICS_ADDRESS` | `127.0.0.1` | Where the metrics ports listen |
| `MUSICAL_CHAIRS_API_METRICS_PORT`, `MUSICAL_CHAIRS_BACKUP_METRICS_PORT` | `9464`, `9465` | The metrics ports |
| `MUSICAL_CHAIRS_LOG_LEVEL` | `INFO` | `DEBUG` adds full paths to the API's logs |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (none) | Turns tracing on; the other standard `OTEL_*` settings work too |
| `MUSICAL_CHAIRS_VERSION` | (the release) | Set by `musical-chairs install` and `musical-chairs upgrade`; don't change it by hand |

## Support
**Fixes go mostly to the latest 1.x release.** Upgrading to it is the usual way to get a fix ([0104](https://github.com/reznik-gev/MusicalChairs/blob/main/docs/decisions/0104-2026-10-21-v1-release-scope-and-support.md)). For anything else, such as a fix for an older release, help with an installation or upgrade, or any other request, **contact the owner of the project**, whatever the reason. Report a security problem privately, as [SECURITY.md](https://github.com/reznik-gev/MusicalChairs/blob/main/SECURITY.md) explains.

When you ask for help, include the output of `musical-chairs status` and the logs of the service that's failing.

## When something's wrong
- **`musical-chairs install` or `musical-chairs upgrade` says the stack didn't become healthy:** it prints the services' states and their last log lines. The `api` log names a failed check, such as `keycloak: Keycloak unreachable`; Keycloak's first start can take a few minutes.
- **The API won't start, and says to run the migrate job:** its database is from another version. `sudo docker compose --project-directory /opt/musical_chairs up -d` runs the migrate job first. After a failed upgrade, use `musical-chairs rollback`.
- **Users see "Musical Chairs is being updated":** the API is down. `musical-chairs status` shows which service isn't healthy.
- **Backups fail:** `musical-chairs status` shows since when. `sudo docker compose --project-directory /opt/musical_chairs logs backup` says why. `musical-chairs-backup check` (under [Backups](#backups)) tests the file and every target.
