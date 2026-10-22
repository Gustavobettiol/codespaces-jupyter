from __future__ import annotations

import json
import os
import re
import gc
from pathlib import Path

from src.config import settings


def safe_stem(value: str) -> str:
    stem = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-")
    if not stem:
        raise ValueError("Cada guion necesita un id con caracteres válidos.")
    return stem[:80]


def generate_voice(
    scripts_path: Path,
    reference: Path | None = None,
) -> list[Path]:
    reference = reference or settings.voice_reference_dir / "argentina.wav"
    consent = settings.voice_reference_dir / "CONSENTIMIENTO.txt"
    if not consent.is_file() or not consent.read_text(encoding="utf-8").strip():
        raise PermissionError(
            f"Falta {consent}: documenta autorización para clonar y publicar la voz."
        )
    if not reference.is_file():
        raise FileNotFoundError(f"No existe el audio de referencia: {reference}")

    import soundfile as sf

    duration = sf.info(reference).duration
    if not 10 <= duration <= 20:
        raise ValueError(
            f"El audio de referencia debe durar entre 10 y 20 segundos; dura {duration:.1f}s."
        )

    scripts = json.loads(scripts_path.read_text(encoding="utf-8"))
    if not isinstance(scripts, list) or not scripts:
        raise ValueError("guiones.json debe contener al menos un guion.")
    if any(not isinstance(item, dict) or not item.get("text") for item in scripts):
        raise ValueError("Cada guion debe contener 'id' y 'text'.")
    ids = [safe_stem(str(item.get("id", index))) for index, item in enumerate(scripts, 1)]
    if len(ids) != len(set(ids)):
        raise ValueError("Los ids de los guiones deben ser únicos.")

    os.environ.setdefault("HF_HOME", str(settings.hf_home))
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    torch.set_num_threads(max(1, min(2, os.cpu_count() or 1)))
    model = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model="v3")
    settings.voice_output_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []
    try:
        for index, script in enumerate(scripts, start=1):
            text = str(script["text"]).strip()
            if not text:
                raise ValueError(f"El guion {index} está vacío.")
            output = settings.voice_output_dir / f"{safe_stem(str(script.get('id', index)))}.wav"
            with torch.inference_mode():
                audio = model.generate(
                    text,
                    language_id="es",
                    audio_prompt_path=str(reference),
                )
            temporary = output.with_suffix(".wav.part")
            try:
                sf.write(str(temporary), audio.detach().cpu().squeeze().numpy(), model.sr)
                temporary.replace(output)
            finally:
                temporary.unlink(missing_ok=True)
            outputs.append(output)
    finally:
        del model
        gc.collect()
    return outputs
