#!/usr/bin/env bash
# List known vulnerabilities in the packages HSP ships (docs/0128): the Python packages of
# backend/ and backup/ (pip-audit), and the frontend's production packages (pnpm audit --prod).
# Development-only packages (pytest, eslint, vite...) are left out: they never reach a customer.
#   deploy/audit-packages.sh
# Findings only warn: the script prints them, adds them to the GitHub job summary when there is
# one, and exits 0. It fails only when a scanner itself could not run. Needs uv, pnpm and jq.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
report="$work/report.md"
found=0

# warn <message>: a GitHub warning annotation, or a plain line outside CI.
warn() {
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then echo "::warning::$1"; else echo "WARNING: $1"; fi
}

# Python: the locked runtime packages of each project, with their hashes.
for project in backend backup; do
  (cd "$root/$project" &&
    uv export --frozen --no-dev --no-emit-project --format requirements-txt --quiet \
      >"$work/$project.txt")
  # pip-audit is one of backend/'s development packages, so Dependabot keeps it current. It
  # exits 1 both for findings and for errors, so success is judged by the JSON it wrote.
  uv run --project "$root/backend" --frozen --quiet pip-audit --disable-pip --requirement "$work/$project.txt" \
    --format json --output "$work/$project.json" >/dev/null 2>"$work/$project.err" || true
  jq -e '.dependencies' "$work/$project.json" >/dev/null 2>&1 || {
    cat "$work/$project.err" >&2
    echo "FAIL: pip-audit did not run on $project/" >&2
    exit 1
  }
  count="$(jq '[.dependencies[].vulns[]] | length' "$work/$project.json")"
  total="$(jq '.dependencies | length' "$work/$project.json")"
  {
    echo "### Python packages in \`$project/\`: $count known vulnerabilities in $total packages"
    if ((count > 0)); then
      echo
      echo "| Package | Version | Advisory | Fixed in |"
      echo "|---|---|---|---|"
      jq -r '.dependencies[] | . as $d | .vulns[] |
        "| \($d.name) | \($d.version) | \(.id) | \(.fix_versions | join(", ") | if . == "" then "no fix yet" else . end) |"' \
        "$work/$project.json"
    fi
    echo
  } >>"$report"
  if ((count > 0)); then
    warn "$project/: $count known vulnerabilities in Python packages (see the job summary)"
    found=1
  fi
done

# Frontend: only what ships in the browser bundle.
# Exits 1 both for findings and for errors, so success is judged by the JSON it wrote.
(cd "$root/frontend" && pnpm audit --prod --json >"$work/frontend.json" 2>"$work/frontend.err") || true
jq -e '.metadata.vulnerabilities' "$work/frontend.json" >/dev/null 2>&1 || {
  cat "$work/frontend.err" "$work/frontend.json" >&2
  echo "FAIL: pnpm audit did not run on frontend/" >&2
  exit 1
}
count="$(jq '[.advisories[]] | length' "$work/frontend.json")"
total="$(jq '.metadata.dependencies' "$work/frontend.json")"
{
  echo "### Frontend production packages: $count known vulnerabilities in $total packages"
  if ((count > 0)); then
    echo
    echo "| Severity | Package | Version | Advisory | Fixed in | Pulled in by |"
    echo "|---|---|---|---|---|---|"
    jq -r '.advisories[] |
      "| \(.severity) | \(.module_name) | \(.findings | map(.version) | unique | join(", ")) | [\(.github_advisory_id)](\(.url)) | \(.patched_versions) | \(.findings[0].paths[0] | split(">")[1]) |"' \
      "$work/frontend.json"
  fi
  echo
} >>"$report"
if ((count > 0)); then
  warn "frontend/: $count known vulnerabilities in production packages (see the job summary)"
  found=1
fi

cat "$report"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  { echo "## Package vulnerabilities (docs/0128)"; echo; cat "$report"; } >>"$GITHUB_STEP_SUMMARY"
fi
((found == 0)) && echo "No known vulnerabilities."
exit 0
