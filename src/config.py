from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def _path_from_env(name: str, default: str) -> Path:
    value = Path(os.getenv(name, default))
    return value if value.is_absolute() else ROOT / value


@dataclass(frozen=True)
class Settings:
    root: Path = ROOT
    profile: str = os.getenv("PERFIL", "cpu").strip().lower()
    device: str = "cpu"
    dtype: str = "bfloat16"
    trigger_word: str = os.getenv("TRIGGER_WORD", "sofiaArg").strip()
    hf_home: Path = _path_from_env("HF_HOME", "salidas/cache/huggingface")
    prompt_dir: Path = ROOT / "prompts"
    dataset_dir: Path = ROOT / "dataset"
    prepared_dataset_dir: Path = ROOT / "salidas/dataset-preparado"
    voice_reference_dir: Path = ROOT / "voz/referencia"
    image_output_dir: Path = ROOT / "salidas/imagenes"
    voice_output_dir: Path = ROOT / "salidas/voz"
    video_output_dir: Path = ROOT / "salidas/videos"
    model_output_dir: Path = ROOT / "salidas/modelos"
    catalog_dir: Path = ROOT / "salidas/catalogo"
    modal_gpu: str = os.getenv("MODAL_GPU", "L40S").strip()
    modal_volume: str = os.getenv("MODAL_VOLUME", "influencer-ai-assets").strip()
    modal_cache_volume: str = os.getenv(
        "MODAL_CACHE_VOLUME", "influencer-ai-model-cache"
    ).strip()

    def validate(self) -> None:
        if self.profile not in {"cpu", "gpu"}:
            raise ValueError("PERFIL debe ser 'cpu' o 'gpu'.")
        if not self.trigger_word or any(char.isspace() for char in self.trigger_word):
            raise ValueError("TRIGGER_WORD debe ser una palabra sin espacios.")


settings = Settings()
settings.validate()


def validate_name(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", value):
        raise ValueError(
            "El nombre debe tener 1–64 caracteres: letras, números, guion y guion bajo."
        )
    return value
