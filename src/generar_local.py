from __future__ import annotations

import json
import os
import gc
from pathlib import Path

import torch
from diffusers import EulerDiscreteScheduler, StableDiffusionXLPipeline, UNet2DConditionModel
from huggingface_hub import hf_hub_download
from safetensors import safe_open

from src.config import settings, validate_name

LIGHTNING_REPO = "ByteDance/SDXL-Lightning"
SDXL_BASE = "stabilityai/stable-diffusion-xl-base-1.0"


def load_pipeline(steps: int = 8) -> StableDiffusionXLPipeline:
    if steps not in {4, 8}:
        raise ValueError(
            "SDXL-Lightning requiere el checkpoint correspondiente: "
            "solo se admiten 4 u 8 pasos."
        )
    os.environ.setdefault("HF_HOME", str(settings.hf_home))
    torch.set_num_threads(max(1, min(2, os.cpu_count() or 1)))
    checkpoint = hf_hub_download(
        LIGHTNING_REPO,
        f"sdxl_lightning_{steps}step_unet.safetensors",
        token=os.getenv("HF_TOKEN") or None,
    )
    with torch.device("meta"):
        unet = UNet2DConditionModel.from_config(SDXL_BASE, subfolder="unet")
    state_dict = {}
    with safe_open(checkpoint, framework="pt", device="cpu") as weights:
        for key in weights.keys():
            tensor = weights.get_tensor(key)
            state_dict[key] = (
                tensor.to(dtype=torch.bfloat16)
                if tensor.is_floating_point()
                else tensor
            )
    unet.load_state_dict(state_dict, assign=True)
    del state_dict
    pipeline = StableDiffusionXLPipeline.from_pretrained(
        SDXL_BASE,
        unet=unet,
        torch_dtype=torch.bfloat16,
        variant="fp16",
        use_safetensors=True,
        token=os.getenv("HF_TOKEN") or None,
    )
    pipeline.scheduler = EulerDiscreteScheduler.from_config(
        pipeline.scheduler.config,
        timestep_spacing="trailing",
    )
    pipeline.to("cpu")
    pipeline.enable_attention_slicing()
    pipeline.enable_vae_slicing()
    pipeline.enable_vae_tiling()
    pipeline.set_progress_bar_config(disable=False)
    return pipeline


def generate(
    prompt: str,
    output: Path,
    *,
    negative_prompt: str = "",
    seed: int = 42,
    steps: int = 8,
    width: int = 768,
    height: int = 768,
) -> Path:
    if not prompt.strip():
        raise ValueError("El prompt no puede estar vacío.")
    if width % 8 or height % 8 or min(width, height) < 256:
        raise ValueError("Ancho y alto deben ser múltiplos de 8 y al menos 256.")

    output.parent.mkdir(parents=True, exist_ok=True)
    generator = torch.Generator(device="cpu").manual_seed(seed)
    pipeline = load_pipeline(steps)
    try:
        with torch.inference_mode():
            image = pipeline(
                prompt=prompt,
                negative_prompt=negative_prompt or None,
                num_inference_steps=steps,
                guidance_scale=0.0,
                width=width,
                height=height,
                generator=generator,
            ).images[0]
            image.save(output)
    finally:
        del pipeline
        gc.collect()
    return output


def generate_scenes(scenes_path: Path, character: str) -> list[Path]:
    validate_name(character)
    scenes = json.loads(scenes_path.read_text(encoding="utf-8"))
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("escenas.json debe contener al menos una escena.")
    character_data = json.loads(
        (settings.prompt_dir / "personaje.json").read_text(encoding="utf-8")
    )
    trigger = str(character_data.get("trigger", settings.trigger_word))
    appearance = str(character_data.get("appearance", ""))
    outputs = []
    for index, scene in enumerate(scenes, start=1):
        if not isinstance(scene, dict) or not isinstance(scene.get("prompt"), str):
            raise ValueError(f"La escena {index} debe incluir un prompt de texto.")
        scene_id = validate_name(str(scene.get("id", f"{index:04d}")))
        prompt = str(scene["prompt"]).strip()
        if not prompt:
            raise ValueError(f"El prompt de la escena {scene_id} está vacío.")
        if trigger not in prompt:
            prompt = f"{trigger}, {appearance}, {prompt}".strip(", ")
        outputs.append(generate(
            prompt,
            settings.image_output_dir / f"{scene_id}.png",
            negative_prompt=str(scene.get("negative_prompt", "")),
            seed=int(scene.get("seed", 42000 + index)),
            steps=8,
            width=768,
            height=768,
        ))
    return outputs
