#!/usr/bin/env bash
# The sizing bench (docs/0120): what a host needs for an office of N people. On a stack that
# `KEEP=1 deploy/test-bundle.sh` installed: measure it idle, seed N people each at a desk, run the
# browser tests 4 at once, 5 times each, sampling every container's CPU and memory, then measure
# the databases, PostgreSQL's folder, a backup and the images. Prints a Markdown summary.
#   HSP_TEST_DIR=<test-bundle's directory> deploy/measure-size.sh 5000
# Needs Docker with the Compose plugin, and pnpm with Playwright's Chromium in frontend/.
set -euo pipefail

people="${1:?usage: deploy/measure-size.sh <people>}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(realpath "${HSP_TEST_DIR:?set HSP_TEST_DIR to the directory test-bundle.sh used}")"
install="$tmp/install"
as_root() { if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi; }
compose() { as_root docker compose --project-directory "$install" "$@"; }
sql() { compose exec -T postgres psql -U postgres -tA "$@"; }
e2e() {
  (cd "$root/frontend" &&
    HSP_E2E_URL=https://localhost:8443 HSP_E2E_IGNORE_HTTPS_ERRORS=1 pnpm exec playwright test "$@")
}
# stats: one "container cpu% memory" line per container, from docker stats.
stats() {
  as_root docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' |
    awk '{ print $1, $2, $3 }'
}
# peaks <samples>: each container's highest CPU and memory, and the highest total memory of one
# sample. Samples are stats lines, each sample's lines followed by an empty line.
peaks() {
  awk '
    function mib(m,   v, u) { v = m; gsub(/[A-Za-z]/, "", v); u = m; gsub(/[0-9.]/, "", u)
      return u == "GiB" ? v * 1024 : (u == "KiB" ? v / 1024 : v) }
    NF == 0 { if (total > top) top = total; total = 0; next }
    { n = $1; c = $2; sub("%", "", c); m = mib($3); total += m
      if (c + 0 > cpu[n]) cpu[n] = c + 0; if (m > mem[n]) mem[n] = m }
    END { if (total > top) top = total
      for (n in cpu) printf "| %s | %.0f%% | %.0f MiB |\n", n, cpu[n], mem[n] | "sort"
      close("sort"); printf "| **all of HSP, at its peak** | | **%.0f MiB** |\n", top }
  ' "$1"
}

echo "## Sizing bench: $people people"
echo
echo "Host: $(nproc) vCPU, $(free -m | awk '/^Mem:/ { printf "%.1f GB", $2 / 1024 }') of memory."
echo

echo "### Idle, after a minute" >&2
sleep 60
idle="$(mktemp)"
stats >"$idle"
echo >>"$idle"
echo "### Idle"
echo
echo "| Container | CPU | Memory |"
echo "|---|---|---|"
peaks "$idle"
echo

echo "### Seed $people people" >&2
start=$SECONDS
HSP_SIZING_PEOPLE="$people" e2e -c e2e/sizing/playwright.config.ts >&2
seeded=$((SECONDS - start))

echo "### The browser tests, 4 at once, 5 times each" >&2
samples="$(mktemp)"
(while true; do stats; echo; sleep 2; done) >"$samples" &
sampler=$!
start=$SECONDS
status=0
e2e --repeat-each 5 --workers 4 >&2 || status=$?
loaded=$((SECONDS - start))
kill "$sampler"
echo "### Under load: the browser tests, 4 at once, 5 times each (${loaded} s)"
echo
echo "| Container | Peak CPU (of one vCPU) | Peak memory |"
echo "|---|---|---|"
peaks "$samples"
echo
if ((status != 0)); then
  echo "**The browser tests failed under load (exit $status).**"
  echo
fi

echo "### Disk"
echo
echo "- Seeding took ${seeded} s."
sql -d hsp -c "SELECT '- ' || count(*) || ' people, ' || (SELECT count(*) FROM seat_assignment) ||
  ' assigned seats' FROM person"
sql -c "SELECT '- Database ' || datname || ': ' || pg_size_pretty(pg_database_size(datname))
  FROM pg_database WHERE datname IN ('hsp', 'keycloak') ORDER BY datname"
echo "- PostgreSQL's folder: $(as_root du -sh "$tmp/data/postgres" | cut -f1)"
backup="$(as_root "$install/bin/hsp" backup now)"
echo "- One backup: $(as_root du -h "$tmp/data/backups/$backup" | cut -f1)"
as_root docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' |
  grep -E 'hsp-|postgis' | sed 's/^/- Image /'
exit "$status"
