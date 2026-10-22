from __future__ import annotations

from collections.abc import ContextManager, Iterable
from pathlib import Path
from typing import Protocol


class BatchUploader(Protocol):
    def put_file(self, local_path: str, remote_path: str) -> None: ...

    def put_directory(self, local_path: str, remote_path: str) -> None: ...


class VolumeHandle(Protocol):
    def batch_upload(self, force: bool = False) -> ContextManager[BatchUploader]: ...

    def read_file(self, path: str) -> Iterable[bytes]: ...


def upload_directory(volume: VolumeHandle, local_path: Path, remote_path: str) -> None:
    if not local_path.is_dir():
        raise FileNotFoundError(f"No existe el directorio requerido: {local_path}")
    with volume.batch_upload(force=True) as batch:
        batch.put_directory(str(local_path), remote_path)


def download_volume_file(volume: VolumeHandle, remote_path: str, local_path: Path) -> None:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = local_path.with_suffix(local_path.suffix + ".part")
    try:
        with temporary.open("wb") as output:
            for chunk in volume.read_file(remote_path.lstrip("/")):
                output.write(chunk)
        temporary.replace(local_path)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def download_volume_files(
    volume: VolumeHandle, files: Iterable[tuple[str, Path]]
) -> list[Path]:
    return [
        download_volume_file_and_return(volume, remote, local)
        for remote, local in files
    ]


def download_volume_file_and_return(
    volume: VolumeHandle, remote_path: str, local_path: Path
) -> Path:
    download_volume_file(volume, remote_path, local_path)
    return local_path
