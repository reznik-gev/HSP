"""A backup file holds its dumps and a manifest with checksums; damage is found (docs/0106)."""

import io
import tarfile
from datetime import UTC, datetime
from pathlib import Path

import pytest

from hsp_backup.archive import ArchiveError, extract_verified, read_manifest, write_archive

CREATED = datetime(2026, 10, 21, 2, 30, tzinfo=UTC)


@pytest.fixture
def members(tmp_path: Path) -> dict[str, Path]:
    """Two dumps and a config file, as a backup holds them."""
    src = tmp_path / "src"
    (src / "config").mkdir(parents=True)
    files = {"hsp.dump": b"hsp data", "keycloak.dump": b"kc data", "config/.env": b"A=1\n"}
    for name, content in files.items():
        (src / name).write_bytes(content)
    return {name: src / name for name in files}


@pytest.fixture
def archive(tmp_path: Path, members: dict[str, Path]) -> Path:
    dest = tmp_path / "hsp-20261021T023000Z-nightly.tar"
    write_archive(
        dest,
        members,
        hsp_version="1.0.0",
        schema_revision="c9b2fc969b7d",
        created=CREATED,
        schedule="nightly",
    )
    return dest


def test_the_manifest_says_what_and_when(archive: Path) -> None:
    manifest = read_manifest(archive)
    assert (manifest.hsp_version, manifest.schema_revision) == ("1.0.0", "c9b2fc969b7d")
    assert (manifest.created_at, manifest.schedule) == (CREATED.isoformat(), "nightly")
    assert sorted(manifest.files) == ["config/.env", "hsp.dump", "keycloak.dump"]
    assert len(manifest.files["hsp.dump"]) == 64


def test_extracting_checks_every_file(archive: Path, tmp_path: Path) -> None:
    out = tmp_path / "out"
    extract_verified(archive, out)
    assert (out / "hsp.dump").read_bytes() == b"hsp data"
    assert (out / "config/.env").read_bytes() == b"A=1\n"


def test_a_damaged_file_is_found(archive: Path, tmp_path: Path) -> None:
    damaged = tmp_path / "damaged.tar"
    with tarfile.open(archive) as src, tarfile.open(damaged, "w") as dst:
        for info in src.getmembers():
            f = src.extractfile(info)
            assert f is not None
            data = f.read()
            if info.name == "hsp.dump":
                data = b"hsp dat!"
            dst.addfile(info, io.BytesIO(data))
    with pytest.raises(ArchiveError, match=r"hsp\.dump doesn't match its checksum"):
        extract_verified(damaged, tmp_path / "out")


def test_something_else_is_not_a_backup(tmp_path: Path) -> None:
    other = tmp_path / "other.tar"
    other.write_bytes(b"not a tar at all")
    with pytest.raises(ArchiveError, match="isn't a readable HSP backup"):
        read_manifest(other)
