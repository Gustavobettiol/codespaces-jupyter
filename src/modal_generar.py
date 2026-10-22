from __future__ import annotations

import json
import os
from pathlib import Path

import modal

from src.config import settings, validate_name
from src.modal_utils import download_volume_files

APP_NAME = "influencer-content-generate"
app = modal.App(APP_NAME)
assets = modal.Volume.from_name(settings.modal_volume, create_if_missing=True)
cache = modal.Volume.from_name(settings.modal_cache_volume, create_if_missing=True)
hf_token = os.getenv("HF_TOKEN")
hf_secrets = [modal.Secret.from_dict({"HF_TOKEN": hf_token})] if hf_token else []

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .add_local_file("requirements-gpu.txt", "/tmp/requirements-gpu.txt", copy=True)
    .run_commands("python -m pip install --no-cache-dir -r /tmp/requirements-gpu.txt")
    .env({"HF_HOME": "/cache/huggingface"})
)


@app.function(
    image=image,
    gpu=settings.modal_gpu,
    timeout=60 * 60,
    volumes={"/assets": assets, "/cache": cache},
    secrets=hf_secrets,
)
def generate_batch(character: str, scenes: list[dict[str, object]]) -> list[str]:
    import torch
    from diffusers import StableDiffusionXLPipeline

    validate_name(character)
    if not scenes:
        raise ValueError("No hay escenas para generar.")
    torch.backends.cuda.matmul.allow_tf32 = True
    pipeline = StableDiffusionXLPipeline.from_pretrained(
        "SG161222/RealVisXL_V5.0",
        torch_dtype=torch.float16,
        use_safetensors=True,
        token=os.getenv("HF_TOKEN") or None,
    ).to("cuda")
    lora_path = Path("/assets/lora") / character / "pytorch_lora_weights.safetensors"
    if lora_path.is_file():
        pipeline.load_lora_weights(str(lora_path.parent), weight_name=lora_path.name)
    else:
        raise FileNotFoundError(
            f"No se encontró el LoRA {lora_path}; ejecuta primero lora-entrenar."
        )

    output_dir = Path("/assets/generated") / character
    output_dir.mkdir(parents=True, exist_ok=True)
    generated: list[str] = []
    try:
        for index, scene in enumerate(scenes, start=1):
            scene_id = validate_name(str(scene.get("id", f"{index:04d}")))
            seed = int(scene.get("seed", 42000 + index))
            generator = torch.Generator(device="cuda").manual_seed(seed)
            with torch.inference_mode():
                result = pipeline(
                    prompt=str(scene["prompt"]),
                    negative_prompt=str(scene.get("negative_prompt", "")) or None,
                    num_inference_steps=int(scene.get("steps", 30)),
                    guidance_scale=float(scene.get("guidance_scale", 5.0)),
                    width=int(scene.get("width", 1024)),
                    height=int(scene.get("height", 1024)),
                    generator=generator,
                )
            target = output_dir / f"{scene_id}.png"
            result.images[0].save(target)
            generated.append(f"/generated/{character}/{target.name}")
    finally:
        del pipeline
        cache.commit()
    assets.commit()
    return generated


@app.local_entrypoint()
def main(
    character: str = "sofia",
    scenes: str = "prompts/escenas.json",
    output_dir: str = "salidas/imagenes",
) -> None:
    validate_name(character)
    scenes_path = Path(scenes)
    scene_data = json.loads(scenes_path.read_text(encoding="utf-8"))
    if not isinstance(scene_data, list) or not scene_data:
        raise ValueError("El archivo de escenas debe contener al menos una escena.")

    character_data = json.loads(
        (settings.prompt_dir / "personaje.json").read_text(encoding="utf-8")
    )
    trigger = str(character_data.get("trigger", settings.trigger_word))
    appearance = str(character_data.get("appearance", ""))
    for index, scene in enumerate(scene_data, start=1):
        if not isinstance(scene, dict) or not isinstance(scene.get("prompt"), str):
            raise ValueError(f"La escena {index} debe incluir un prompt de texto.")
        scene["id"] = validate_name(str(scene.get("id", f"{index:04d}")))
        prompt = str(scene["prompt"])
        if trigger not in prompt:
            scene["prompt"] = f"{trigger}, {appearance}, {prompt}".strip(", ")

    lora_file = settings.model_output_dir / character / "pytorch_lora_weights.safetensors"
    if not lora_file.is_file():
        raise FileNotFoundError(f"No existe el LoRA local: {lora_file}")
    with assets.batch_upload(force=True) as batch:
        batch.put_file(str(lora_file), f"/lora/{character}/{lora_file.name}")

    remote_files = generate_batch.remote(character, scene_data)
    local_targets = [
        (path, Path(output_dir) / Path(path).name) for path in remote_files
    ]
    downloaded = download_volume_files(assets, local_targets)
    print(f"Imágenes generadas: {len(downloaded)}")
