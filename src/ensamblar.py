from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from src.config import settings


def assemble(image: Path, audio: Path, output: Path | None = None) -> Path:
    if not image.is_file():
        raise FileNotFoundError(f"No existe la imagen: {image}")
    if not audio.is_file():
        raise FileNotFoundError(f"No existe el audio: {audio}")
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise RuntimeError("No se encontró ffmpeg; debe venir en la imagen universal.")

    output = output or settings.video_output_dir / f"{image.stem}.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f"{output.stem}.part{output.suffix}")
    command = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-loop", "1", "-i", str(image), "-i", str(audio),
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,"
        "zoompan=z='min(zoom+0.0005,1.08)':d=1:s=1080x1920:fps=30,"
        "format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart",
        str(temporary),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
        temporary.replace(output)
    except subprocess.CalledProcessError as error:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"ffmpeg no pudo ensamblar el video: {error.stderr.strip()}") from error
    return output
