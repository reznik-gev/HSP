#!/usr/bin/env bash
# Assemble the offline release bundle hsp-<version>.tar.gz (docs/0054, docs/0102) from images
# already built by deploy/build-images.sh <version>. Third-party images (PostGIS) are pulled.
#   deploy/bundle.sh <version> <notes-file> [out-dir]     # out-dir defaults to ./dist
# Writes <out-dir>/hsp-<version>.tar.gz and <out-dir>/hsp-<version>.tar.gz.sha256.
set -euo pipefail

version="${1:?usage: deploy/bundle.sh <version> <notes-file> [out-dir]}"
notes="${2:?usage: deploy/bundle.sh <version> <notes-file> [out-dir]}"
out="${3:-dist}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
name="hsp-$version"
# A GitHub Release file may be up to 2 GiB; stay clear of it.
max_bytes=$((1900 * 1024 * 1024))

mkdir -p "$out"
out="$(cd "$out" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
dir="$work/$name"
mkdir -p "$dir/images" "$dir/compose" "$dir/docs"

# Every image the stack runs, read from compose.yml so none can be missed.
mapfile -t images < <(
  HSP_VERSION="$version" HSP_PUBLIC_URL=https://hsp.invalid \
    docker compose -f "$root/deploy/compose/compose.yml" config --images | sort -u
)
echo "Images: ${images[*]}"
for image in "${images[@]}"; do
  if [[ "$image" == hsp-* ]]; then
    docker image inspect "$image" >/dev/null || {
      echo "FAIL: $image is missing; run deploy/build-images.sh $version first" >&2
      exit 1
    }
  else
    docker pull --quiet --platform linux/amd64 "$image"
  fi
  # postgis/postgis:18-3.6 -> postgis_postgis_18-3.6.tar
  docker save -o "$dir/images/${image//[\/:]/_}.tar" "$image"
done

cp "$root/deploy/compose/compose.yml" "$dir/compose/"
cp -r "$root/deploy/compose/postgres-init" "$dir/compose/"
sed "s/^HSP_VERSION=.*/HSP_VERSION=$version/" "$root/deploy/compose/.env.example" \
  > "$dir/compose/.env.example"
cp "$root/deploy/README.md" "$dir/docs/install.md"
cp "$notes" "$dir/docs/release-notes.md"
cp "$root/CHANGELOG.md" "$dir/docs/CHANGELOG.md"
cp "$root/LICENSE" "$dir/"
echo "$version" > "$dir/VERSION"

(cd "$dir" && find . -type f ! -name SHA256SUMS -printf '%P\n' | sort | xargs sha256sum > SHA256SUMS)

tarball="$out/$name.tar.gz"
gzip_cmd=gzip
command -v pigz >/dev/null && gzip_cmd=pigz
tar -C "$work" -cf - "$name" | "$gzip_cmd" > "$tarball"
(cd "$out" && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")

size="$(stat -c %s "$tarball")"
echo "Wrote $tarball ($((size / 1024 / 1024)) MiB)"
if ((size > max_bytes)); then
  echo "FAIL: the bundle is over $((max_bytes / 1024 / 1024)) MiB, too close to GitHub's 2 GiB file limit" >&2
  exit 1
fi
