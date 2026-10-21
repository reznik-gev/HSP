"""One backup is one tar file (docs/0106):

    manifest.json        the HSP version, schema revision, time, schedule, and every file's SHA-256
    hsp.dump             pg_dump custom format, already compressed
    keycloak.dump
    config/.env          with include_config; never secrets/
    config/backups.yml
    config/compose.yml

The tar itself isn't compressed: the dumps already are.
"""

import hashlib
import json
import tarfile
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

MANIFEST = "manifest.json"
FORMAT = 1


class ArchiveError(Exception):
    """The backup file is damaged or isn't an HSP backup."""


@dataclass(frozen=True)
class Manifest:
    hsp_version: str
    schema_revision: str | None
    created_at: str  # ISO 8601, UTC
    schedule: str
    files: dict[str, str]  # name in the archive -> SHA-256
    format: int = FORMAT


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def write_archive(
    dest: Path,
    members: dict[str, Path],
    *,
    hsp_version: str,
    schema_revision: str | None,
    created: datetime,
    schedule: str,
) -> Manifest:
    """Write `members` (name in the archive -> local file) and their manifest to `dest`."""
    manifest = Manifest(
        hsp_version=hsp_version,
        schema_revision=schema_revision,
        created_at=created.isoformat(),
        schedule=schedule,
        files={name: sha256(path) for name, path in members.items()},
    )
    manifest_file = dest.with_name(dest.name + ".manifest")
    manifest_file.write_text(json.dumps(asdict(manifest), indent=2), encoding="utf-8")
    try:
        with tarfile.open(dest, "w") as tar:
            tar.add(manifest_file, arcname=MANIFEST)
            for name, path in members.items():
                tar.add(path, arcname=name)
    finally:
        manifest_file.unlink()
    return manifest


def read_manifest(archive: Path) -> Manifest:
    try:
        with tarfile.open(archive, "r") as tar:
            f = tar.extractfile(MANIFEST)
            if f is None:
                raise ArchiveError(f"{archive.name} has no {MANIFEST}")
            data = json.load(f)
    except (tarfile.TarError, KeyError, json.JSONDecodeError) as exc:
        raise ArchiveError(f"{archive.name} isn't a readable HSP backup ({exc})") from None
    try:
        return Manifest(**data)
    except TypeError:
        raise ArchiveError(f"{archive.name} has a manifest this version can't read") from None


def extract_verified(archive: Path, into: Path) -> Manifest:
    """Unpack the files the manifest lists into `into`, and check each one's SHA-256."""
    manifest = read_manifest(archive)
    with tarfile.open(archive, "r") as tar:
        for name in manifest.files:
            try:
                tar.extract(name, into, filter="data")
            except KeyError:
                raise ArchiveError(f"{archive.name} is missing {name}") from None
    for name, expected in manifest.files.items():
        if sha256(into / name) != expected:
            raise ArchiveError(f"{archive.name} is damaged: {name} doesn't match its checksum")
    return manifest
