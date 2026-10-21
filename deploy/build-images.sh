#!/usr/bin/env bash
# Build the HSP images locally (docs/0097): hsp-api, hsp-web, hsp-keycloak and hsp-backup
# (docs/0106), tagged <version>.
#   deploy/build-images.sh            # tagged 0.0.0-dev
#   deploy/build-images.sh 1.2.0
# Run from anywhere; needs Docker with BuildKit (the default since Docker 23).
# HSP_BUILD_CACHE=gha uses the GitHub Actions cache, one scope per image (CI only; needs a
# docker-container builder and the Actions runtime token).
set -euo pipefail

version="${1:-0.0.0-dev}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
args=(
  --platform linux/amd64
  --build-arg "HSP_VERSION=$version"
  --build-arg "HSP_REVISION=$(git -C "$root" rev-parse HEAD)"
  --build-arg "HSP_CREATED=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
)

# build <image> <context> [extra docker build options]
build() {
  local image="$1" context="$2"
  shift 2
  local cache=()
  if [[ "${HSP_BUILD_CACHE:-}" == gha ]]; then
    cache=(--load --cache-from "type=gha,scope=$image" --cache-to "type=gha,scope=$image,mode=max")
  fi
  docker buildx build "${args[@]}" "${cache[@]}" "$@" -t "$image:$version" "$context"
}

build hsp-api "$root/backend"
build hsp-web "$root/deploy/web" --build-context "frontend=$root/frontend"
build hsp-keycloak "$root/deploy/keycloak"
build hsp-backup "$root/deploy/backup" --build-context "backup=$root/backup"
echo "Built hsp-api, hsp-web, hsp-keycloak and hsp-backup, tagged $version."
