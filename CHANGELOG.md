# Changelog

What changes for people using and running HSP, release by release ([0102](docs/decisions/0102-2026-10-19-release-workflow.md)). Each pull request that changes something users or operators notice adds a line under **Unreleased**. To release, rename that section to the version and date, and start a new empty one ([how to release](docs/guides/releasing.md)).

Versions follow MAJOR.MINOR.PATCH ([0063](docs/decisions/0063-2026-10-08-release-versioning.md)).

## [Unreleased]
The first release.

### For everyone
- See each floor's plan, and find where someone sits from the search in the top bar.
- English and Hebrew, with the layout mirrored for Hebrew.

### For admins
- Manage sites, buildings, floors, people, teams, the catalog of furniture and devices, and zone types.
- Import people and teams from a CSV or Excel file.
- Draw floors in the editor: walls, zones, seats and devices, to the centimetre, with heights shown on the plan. Problems are listed as you draw. Publish a floor when it's ready, or discard the draft.
- Walls snap straight: horizontal, vertical or 45° from their other end, shown with a marker. Shift keeps them straight however far off you point.
- Drag a selected wall to move it whole; the walls joined to it stretch to stay joined (Alt detaches it). Changing a wall's length keeps its corner and moves its free end.
- The arrow keys nudge the selection by 1 cm, or 10 cm with Shift. A run of presses is one step to undo.
- Assign seats to people and teams. Archiving a person or deleting a floor frees their seats on its own.

### For operators
- Install from one offline bundle: the images, the Compose stack and its documentation. No registry is contacted.
- Sign-in through the bundled Keycloak. HSP serves HTTPS itself, or runs behind your own proxy.
