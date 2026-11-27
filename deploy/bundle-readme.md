# Musical Chairs @VERSION@

Musical Chairs manages office space: sites, buildings and floors drawn as plans, seats assigned to people and teams, and the org chart. This folder is its offline release bundle. It holds everything needed to install Musical Chairs on one Linux host, with no internet access.

## Start here
Read **[docs/install.md](docs/install.md)**. It says what the host needs, how to install, how people sign in, and how to back up, upgrade and change settings.

In short, on a Linux host with Docker, from this folder:
```bash
sudo bin/musical-chairs install
```
It checks the bundle, asks where users will reach Musical Chairs, whether it serves HTTPS itself, and who the first admin is, then starts it. Read [What you need](docs/install.md#what-you-need) first.

## What's in this folder
| Path | What |
|---|---|
| `bin/musical-chairs` | The command that installs, upgrades, backs up and restores Musical Chairs |
| `compose/` | The Docker Compose stack, with example settings and backup schedules |
| `images/` | The container images, loaded when you install |
| `docs/install.md` | How to install and run Musical Chairs |
| `docs/release-notes.md` | What's in this release |
| `docs/CHANGELOG.md` | What changed in every release so far |
| `VERSION` | This release's version |
| `SHA256SUMS` | The checksum of every file here. `musical-chairs install` checks them. |
| `LICENSE` | The license |

## Help
See [Support](docs/install.md#support) in the installation guide. When you ask for help, include the output of `musical-chairs status`.
