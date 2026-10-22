from __future__ import annotations

from pathlib import Path


def validate_musetalk_inputs(video: Path, audio: Path) -> tuple[Path, Path]:
    if not video.is_file():
        raise FileNotFoundError(f"No existe el video base: {video}")
    if not audio.is_file():
        raise FileNotFoundError(f"No existe el audio: {audio}")
    return video, audio


def create_lipsync(*_args: object, **_kwargs: object) -> Path:
    raise NotImplementedError(
        "La sincronización con MuseTalk no está activada: requiere preparar y "
        "validar sus checkpoints y la imagen base en Modal. El clip con zoom "
        "de src.ensamblar es el flujo disponible."
    )
