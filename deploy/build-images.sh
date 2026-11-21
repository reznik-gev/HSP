#!/usr/bin/env bash
# Build the Musical Chairs images locally (docs/0097): musical-chairs-api, musical-chairs-web, musical-chairs-keycloak and musical-chairs-backup
# (docs/0106), tagged <version>.
#   deploy/build-images.sh            # tagged 0.0.0-dev
#   deploy/build-images.sh 1.2.0
# Run from anywhere; needs Docker with BuildKit (the default since Docker 23).
# MUSICAL_CHAIRS_BUILD_CACHE=gha uses the GitHub Actions cache, one scope per image (CI only; needs a
# docker-container builder and the Actions runtime token).
set -euo pipefail

version="${1:-0.0.0-dev}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
args=(
  --platform linux/amd64
  --build-arg "MUSICAL_CHAIRS_VERSION=$version"
  --build-arg "MUSICAL_CHAIRS_REVISION=$(git -C "$root" rev-parse HEAD)"
  --build-arg "MUSICAL_CHAIRS_CREATED=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
)

# build <image> <context> [extra docker build options]
build() {
  local image="$1" context="$2"
  shift 2
  local cache=()
  if [[ "${MUSICAL_CHAIRS_BUILD_CACHE:-}" == gha ]]; then
    cache=(--load --cache-from "type=gha,scope=$image" --cache-to "type=gha,scope=$image,mode=max")
  fi
  docker buildx build "${args[@]}" "${cache[@]}" "$@" -t "$image:$version" "$context"
}

build musical-chairs-api "$root/backend"
build musical-chairs-web "$root/deploy/web" --build-context "frontend=$root/frontend"
build musical-chairs-keycloak "$root/deploy/keycloak"
build musical-chairs-backup "$root/deploy/backup" --build-context "backup=$root/backup"
echo "Built musical-chairs-api, musical-chairs-web, musical-chairs-keycloak and musical-chairs-backup, tagged $version."
