from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from src.config import settings, validate_name

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def prepare_dataset(character: str, size: int = 1024) -> Path:
    validate_name(character)
    if size < 256 or size % 8:
        raise ValueError("El tamaño de imagen debe ser múltiplo de 8 y al menos 256.")

    source = settings.dataset_dir / character
    consent = source / "CONSENTIMIENTO.txt"
    if not consent.is_file() or not consent.read_text(encoding="utf-8").strip():
        raise PermissionError(
            f"Falta {consent}: documenta autorización para entrenar y publicar "
            "imágenes derivadas antes de procesar referencias."
        )

    images = sorted(
        path for path in source.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )
    if not 20 <= len(images) <= 30:
        raise ValueError(
            f"Se requieren entre 20 y 30 imágenes; se encontraron {len(images)}."
        )

    character_config = json.loads(
        (settings.prompt_dir / "personaje.json").read_text(encoding="utf-8")
    )
    trigger = str(character_config.get("trigger", settings.trigger_word)).strip()
    appearance = str(character_config.get("appearance", "")).strip()
    if not trigger or not appearance:
        raise ValueError("personaje.json debe definir 'trigger' y 'appearance'.")

    overrides_path = source / "captions.json"
    overrides = (
        json.loads(overrides_path.read_text(encoding="utf-8"))
        if overrides_path.is_file()
        else {}
    )
    if not isinstance(overrides, dict):
        raise ValueError("captions.json debe ser un objeto filename->caption.")
    destination = settings.prepared_dataset_dir / character
    destination.mkdir(parents=True, exist_ok=True)

    records: list[dict[str, str]] = []
    for index, image_path in enumerate(images, start=1):
        output_name = f"{index:03d}.jpg"
        try:
            with Image.open(image_path) as source_image:
                image = ImageOps.exif_transpose(source_image).convert("RGB")
                image = ImageOps.fit(image, (size, size), method=Image.Resampling.LANCZOS)
                image.save(destination / output_name, format="JPEG", quality=92, optimize=True)
        except (UnidentifiedImageError, OSError) as error:
            raise ValueError(f"No se pudo procesar {image_path.name}: {error}") from error

        custom_caption = overrides.get(image_path.name, "")
        caption = " ".join(
            part for part in (trigger, appearance, str(custom_caption).strip()) if part
        )
        records.append({"file_name": output_name, "text": caption})

    metadata = destination / "metadata.jsonl"
    metadata.write_text(
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in records),
        encoding="utf-8",
    )
    (destination / "CONSENTIMIENTO.txt").write_text(
        consent.read_text(encoding="utf-8"), encoding="utf-8"
    )
    return destination
