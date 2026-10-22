from __future__ import annotations

import json
import os
import shutil
import subprocess
import uuid
from pathlib import Path

import modal

from src.config import settings, validate_name
from src.modal_utils import download_volume_file, upload_directory

app = modal.App("influencer-lora-train")
assets = modal.Volume.from_name(settings.modal_volume, create_if_missing=True)
cache = modal.Volume.from_name(settings.modal_cache_volume, create_if_missing=True)
hf_token = os.getenv("HF_TOKEN")
hf_secrets = [modal.Secret.from_dict({"HF_TOKEN": hf_token})] if hf_token else []

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .add_local_file("requirements-gpu.txt", "/tmp/requirements-gpu.txt", copy=True)
    .run_commands("python -m pip install --no-cache-dir -r /tmp/requirements-gpu.txt")
    .run_commands(
        "git clone --depth 1 --branch v0.35.1 "
        "https://github.com/huggingface/diffusers.git /opt/diffusers"
    )
    .env({"HF_HOME": "/cache/huggingface"})
)


@app.function(
    image=image,
    gpu=settings.modal_gpu,
    timeout=60 * 60 * 4,
    volumes={"/assets": assets, "/cache": cache},
    secrets=hf_secrets,
)
def train_lora(character: str, steps: int, trigger: str) -> str:
    validate_name(character)
    if not 100 <= steps <= 3000:
        raise ValueError("El entrenamiento admite entre 100 y 3000 pasos.")
    source = Path("/assets/datasets") / character
    metadata = source / "metadata.jsonl"
    if not metadata.is_file():
        raise FileNotFoundError(f"Falta el dataset preparado: {metadata}")
    rows = [
        json.loads(line) for line in metadata.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not 20 <= len(rows) <= 30:
        raise ValueError(f"El dataset debe tener 20–30 referencias, recibió {len(rows)}.")
    if not trigger or any(char.isspace() for char in trigger):
        raise ValueError("El trigger del personaje debe ser una sola palabra.")
    if any(trigger not in str(row.get("text", "")) for row in rows):
        raise ValueError("Todos los captions deben incluir el trigger del personaje.")
    for row in rows:
        filename = row.get("file_name")
        if not isinstance(filename, str) or Path(filename).name != filename:
            raise ValueError("El dataset contiene un nombre de archivo no válido.")
        if not (source / filename).is_file():
            raise FileNotFoundError(f"Falta una imagen de entrenamiento: {filename}")
    consent = source / "CONSENTIMIENTO.txt"
    if not consent.is_file() or not consent.read_text(encoding="utf-8").strip():
        raise PermissionError("El dataset remoto no incluye el consentimiento requerido.")

    run_output = Path("/tmp/lora-runs") / f"{character}-{uuid.uuid4().hex}"
    run_output.mkdir(parents=True, exist_ok=True)
    script = "/opt/diffusers/examples/text_to_image/train_text_to_image_lora_sdxl.py"
    command = [
        "accelerate", "launch", script,
        "--pretrained_model_name_or_path", "SG161222/RealVisXL_V5.0",
        "--train_data_dir", str(source),
        "--image_column", "image",
        "--caption_column", "text",
        "--resolution", "1024",
        "--center_crop",
        "--random_flip",
        "--train_batch_size", "1",
        "--gradient_accumulation_steps", "4",
        "--gradient_checkpointing",
        "--mixed_precision", "fp16",
        "--learning_rate", "1e-4",
        "--lr_scheduler", "constant",
        "--lr_warmup_steps", "0",
        "--max_train_steps", str(steps),
        "--output_dir", str(run_output),
        "--seed", "42",
        "--report_to", "none",
    ]
    subprocess.run(command, check=True)
    candidates = list(run_output.rglob("pytorch_lora_weights.safetensors"))
    if not candidates:
        raise RuntimeError("El entrenamiento terminó sin crear los pesos LoRA esperados.")
    source_weights = candidates[-1]
    final_weights = Path("/assets/lora") / character / "pytorch_lora_weights.safetensors"
    final_weights.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_weights, final_weights)
    assets.commit()
    cache.commit()
    return f"/lora/{character}/{final_weights.name}"


@app.local_entrypoint()
def main(
    character: str = "sofia",
    dataset: str = "",
    steps: int = 800,
) -> None:
    validate_name(character)
    if not 100 <= steps <= 3000:
        raise ValueError("El entrenamiento admite entre 100 y 3000 pasos.")
    prepared = Path(dataset) if dataset else settings.prepared_dataset_dir / character
    upload_directory(assets, prepared, f"/datasets/{character}")

    character_file = settings.prompt_dir / "personaje.json"
    character_data = json.loads(character_file.read_text(encoding="utf-8"))
    trigger = str(character_data.get("trigger", settings.trigger_word))
    result = train_lora.remote(character, steps, trigger)

    local_output = settings.model_output_dir / character / Path(result).name
    download_volume_file(assets, result, local_output)
    print(f"LoRA guardado en {local_output}")
