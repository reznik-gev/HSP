#!/usr/bin/env bash
# List known vulnerabilities in every image the stack runs (docs/0128), with Trivy: hsp-api,
# hsp-web, hsp-keycloak and hsp-backup as built by deploy/build-images.sh, and PostGIS as
# published (pulled if missing). Covers the system libraries and the packages inside them.
#   deploy/scan-images.sh [version]      # default 0.0.0-dev
# Findings only warn: the script prints a count per image and the High and Critical ones, adds
# them to the GitHub job summary when there is one, and exits 0. It fails only when Trivy itself
# could not run. Trivy runs as its own pinned image; needs Docker and jq.
set -euo pipefail

version="${1:-0.0.0-dev}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Pinned by digest, so a re-pushed tag can't change what runs here.
trivy=aquasec/trivy:0.76.1@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c
work="$(mktemp -d)"
cache="hsp-trivy-cache"
trap 'rm -rf "$work"' EXIT
report="$work/report.md"
found=0

warn() {
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then echo "::warning::$1"; else echo "WARNING: $1"; fi
}

# Every image the stack runs, read from compose.yml as deploy/bundle.sh does. Read into a
# variable first, so that a compose error stops the script instead of scanning nothing.
listed="$(HSP_VERSION="$version" HSP_PUBLIC_URL=https://hsp.invalid \
  docker compose -f "$root/deploy/compose/compose.yml" config --images)"
mapfile -t images < <(sort -u <<<"$listed")
((${#images[@]} > 0)) || { echo "FAIL: compose.yml lists no images" >&2; exit 1; }

{
  echo "| Image | Critical | High | Medium | Low | Unknown | Of which have a fix |"
  echo "|---|---|---|---|---|---|---|"
} >"$work/counts.md"
: >"$work/details.md"

for image in "${images[@]}"; do
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    [[ "$image" == hsp-* ]] && { echo "FAIL: $image is missing; run deploy/build-images.sh $version first" >&2; exit 1; }
    docker pull --quiet --platform linux/amd64 "$image" >/dev/null
  fi
  json="$work/${image//[\/:]/_}.json"
  echo "Scanning $image..."
  # The vulnerability database is downloaded once per run and kept in a volume between images.
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$cache:/root/.cache/trivy" \
    "$trivy" image --quiet --scanners vuln --format json "$image" >"$json"
  vulns="$work/vulns.json"
  # Debian packages are "debian", Python ones "python-pkg", Keycloak's Java ones "jar".
  jq '[.Results[]? | .Type as $t | .Vulnerabilities[]? | . + {Type: $t}] | unique_by(.VulnerabilityID, .PkgName, .InstalledVersion)' \
    "$json" >"$vulns"
  n() { jq --arg s "$1" '[.[] | select(.Severity == $s)] | length' "$vulns"; }
  total="$(jq length "$vulns")"
  fixable="$(jq '[.[] | select((.FixedVersion // "") != "")] | length' "$vulns")"
  echo "| \`$image\` | $(n CRITICAL) | $(n HIGH) | $(n MEDIUM) | $(n LOW) | $(n UNKNOWN) | $fixable of $total |" >>"$work/counts.md"
  serious="$(jq '[.[] | select(.Severity == "CRITICAL" or .Severity == "HIGH")] | length' "$vulns")"
  if ((serious > 0)); then
    found=1
    warn "$image: $serious High or Critical vulnerabilities (see the job summary)"
    {
      echo "#### \`$image\`: High and Critical"
      echo
      # One row per advisory: a flaw in util-linux, say, touches several of its packages.
      echo "| Severity | Advisory | Packages | Installed | Fixed in | Kind |"
      echo "|---|---|---|---|---|---|"
      jq -r 'map(select(.Severity == "CRITICAL" or .Severity == "HIGH"))
        | group_by(.VulnerabilityID, .Type) | map({
            severity: .[0].Severity, id: .[0].VulnerabilityID, kind: .[0].Type,
            packages: (map(.PkgName) | unique | join(", ")),
            installed: (map(.InstalledVersion) | unique | join(", ")),
            fixed: (map(.FixedVersion // "" | select(. != "")) | unique | join(", ")
              | if . == "" then "no fix yet" else . end)})
        | sort_by(.severity, .packages)[]
        | "| \(.severity | ascii_downcase) | \(.id) | \(.packages) | \(.installed) | \(.fixed) | \(.kind) |"' \
        "$vulns"
      echo
    } >>"$work/details.md"
  fi
done

{
  echo "### Images: known vulnerabilities by severity"
  echo
  cat "$work/counts.md"
  echo
  cat "$work/details.md"
} >"$report"
cat "$report"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  { echo "## Image vulnerabilities (docs/0128)"; echo; cat "$report"; } >>"$GITHUB_STEP_SUMMARY"
fi
((found == 0)) && echo "No High or Critical vulnerabilities."
exit 0
