# Changelog

What changes for people using and running HSP, release by release ([0102](docs/decisions/0102-2026-10-19-release-workflow.md)). Each pull request that changes something users or operators notice adds a line under **Unreleased**. To release, rename that section to the version and date, and start a new empty one ([how to release](docs/guides/releasing.md)).

Versions follow MAJOR.MINOR.PATCH ([0063](docs/decisions/0063-2026-10-08-release-versioning.md)).

## [Unreleased]
The first release.

### For everyone
- See each floor's plan, and find where someone sits from the search in the top bar.
- English and Hebrew, with the layout mirrored for Hebrew.
- The user menu and the bottom of the sidebar show which release of HSP you're using.
- A floor's page shows a newly published version within 30 seconds, and that someone started editing within 15, without reloading.

### For admins
- Manage sites, buildings, floors, people, teams, the catalog of furniture and devices, and zone types.
- Import people and teams from a CSV or Excel file.
- Draw floors in the editor: walls, zones, seats and devices, to the centimetre, with heights shown on the plan. Problems are listed as you draw. Publish a floor when it's ready, or discard the draft.
- Walls snap straight: horizontal, vertical or 45° from their other end, shown with a marker. Shift keeps them straight however far off you point.
- Drag a selected wall to move it whole; the walls joined to it stretch to stay joined (Alt detaches it). Changing a wall's length keeps its corner and moves its free end.
- The arrow keys nudge the selection by 1 cm, or 10 cm with Shift. A run of presses is one step to undo.
- Assign seats to people and teams. Archiving a person or deleting a floor frees their seats on its own.

### For operators
- Install from one offline bundle: the images, the Compose stack and its documentation. No registry is contacted. `sudo bin/hsp install` checks it, sets it up and starts it, and `hsp status` shows how it's doing.
- `hsp backup now` takes a backup, `hsp backup list` lists them, and `hsp restore` brings one back. On a new host, `hsp install --secrets` installs with the old host's saved secrets, so its backups can be restored.
- `hsp upgrade` moves to a new release with a backup first, and `hsp rollback` undoes it.
- An installation guide, `docs/install.md` in the bundle: what the host needs (with hardware sizes measured for up to 5,000 people), installing, Active Directory sign-in, monitoring, backups, upgrades, every setting, and which versions get fixes.
- Sign-in through the bundled Keycloak. HSP serves HTTPS itself, or runs behind your own proxy.
- The API logs one JSON line per request: the route, status, time taken, request ID and who made it. Set `HSP_LOG_LEVEL=DEBUG` to add the full path.
- `/readyz` checks the database, its schema version and Keycloak, and names what isn't ready. The API refuses to start on a database that wasn't migrated for its version.
- Prometheus metrics from the API: requests by route, changesets and publishes, edit-lock refusals and database connections. Only the host itself can reach them, unless you set `HSP_METRICS_ADDRESS`.
- OpenTelemetry tracing of requests and database queries, off until you set `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Scheduled backups of HSP's and Keycloak's databases, to a folder or to S3, on the schedules you set in `backups.yml`. Each schedule keeps its own number of backups. Restoring refuses a backup from a newer version.
