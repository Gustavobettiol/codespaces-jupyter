from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from src.config import settings


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Pipeline de contenido IA")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("estado", help="Comprueba estructura y configuración local")

    dataset = commands.add_parser("preparar-dataset")
    dataset.add_argument("--personaje", default="sofia")

    voice = commands.add_parser("voz")
    voice.add_argument("--guiones", type=Path, default=settings.prompt_dir / "guiones.json")
    voice.add_argument("--referencia", type=Path)

    images = commands.add_parser("imgs")
    images.add_argument("--personaje", default="sofia")
    images.add_argument("--escenas", type=Path, default=settings.prompt_dir / "escenas.json")

    local = commands.add_parser("generar-local")
    local.add_argument("--prompt", required=True)
    local.add_argument("--salida", type=Path, required=True)
    local.add_argument("--negativo", default="")
    local.add_argument("--semilla", type=int, default=42001)
    local.add_argument("--pasos", type=int, choices=(4, 8), default=8)
    local.add_argument("--ancho", type=int, default=768)
    local.add_argument("--alto", type=int, default=768)

    train = commands.add_parser("lora-entrenar")
    train.add_argument("--personaje", default="sofia")
    train.add_argument("--pasos", type=int, default=800)

    video = commands.add_parser("video")
    video.add_argument("--imagen", type=Path, required=True)
    video.add_argument("--audio", type=Path, required=True)
    video.add_argument("--salida", type=Path)

    catalog = commands.add_parser("catalogo")
    catalog.add_argument("--archivo", type=Path, required=True)
    catalog.add_argument("--tipo", choices=("image", "audio", "video"))

    all_command = commands.add_parser("todo")
    all_command.add_argument("--personaje", default="sofia")
    all_command.add_argument("--escenas", type=Path, default=settings.prompt_dir / "escenas.json")
    all_command.add_argument("--guiones", type=Path, default=settings.prompt_dir / "guiones.json")

    return parser


def _run_modal(script: str, *arguments: str) -> None:
    command = ["modal", "run", script, *arguments]
    try:
        subprocess.run(command, cwd=settings.root, check=True)
    except FileNotFoundError as error:
        raise RuntimeError(
            "No se encontró Modal CLI. Ejecuta make setup y configura `modal setup`."
        ) from error
    except subprocess.CalledProcessError as error:
        raise RuntimeError(f"El trabajo Modal terminó con código {error.returncode}.") from error


def _load_scenes(path: Path) -> list[dict[str, object]]:
    content = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(content, list) or not content:
        raise ValueError(f"{path} debe contener una lista JSON con escenas.")
    if any(not isinstance(scene, dict) or not isinstance(scene.get("prompt"), str) for scene in content):
        raise ValueError(f"Cada escena de {path} debe incluir un prompt de texto.")
    scene_ids = [str(scene.get("id", index)) for index, scene in enumerate(content, 1)]
    if len(scene_ids) != len(set(scene_ids)):
        raise ValueError(f"Los ids de escena en {path} deben ser únicos.")
    return content


def _images(character: str, scenes: Path) -> list[Path]:
    if settings.profile == "gpu":
        output = settings.image_output_dir
        _run_modal(
            "src/modal_generar.py",
            "--character", character,
            "--scenes", str(scenes),
            "--output-dir", str(output),
        )
        return [
            output / f"{str(scene.get('id', f'{index:04d}'))}.png"
            for index, scene in enumerate(_load_scenes(scenes), start=1)
        ]
    from src.generar_local import generate_scenes

    return generate_scenes(scenes, character)


def _todo(character: str, scenes_path: Path, scripts_path: Path) -> None:
    from src.catalogo import register_asset
    from src.ensamblar import assemble
    from src.voz import generate_voice

    scenes = _load_scenes(scenes_path)
    voice_files = generate_voice(scripts_path)
    images = _images(character, scenes_path)
    scripts = json.loads(scripts_path.read_text(encoding="utf-8"))
    audio_by_id = {
        str(script.get("id", index)): path
        for index, (script, path) in enumerate(zip(scripts, voice_files), start=1)
    }
    for scene, image in zip(scenes, images):
        scene_id = str(scene.get("id", image.stem))
        audio = audio_by_id.get(str(scene.get("guion_id", "")))
        if audio is None:
            if not voice_files:
                raise RuntimeError("No se generaron audios para las escenas.")
            audio = voice_files[0]
        video = assemble(image, audio, settings.video_output_dir / f"{scene_id}.mp4")
        register_asset(image, "image")
        register_asset(audio, "audio")
        register_asset(video, "video")
        print(f"Catálogo: {scene_id} -> {video}")


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "estado":
            settings.validate()
            expected_cpu_packages = {
                "torch": "2.6.0+cpu",
                "torchvision": "0.21.0+cpu",
                "torchaudio": "2.6.0+cpu",
            }
            required_packages = (
                "diffusers",
                "transformers",
                "chatterbox-tts",
                "modal",
                "safetensors",
                "huggingface_hub",
                "python-dotenv",
                "Pillow",
                "numpy",
                "soundfile",
            )
            mismatched = []
            for package, expected in expected_cpu_packages.items():
                try:
                    installed = version(package)
                except PackageNotFoundError:
                    installed = "no instalado"
                if installed != expected:
                    mismatched.append(f"{package}={installed} (requiere {expected})")
            missing = []
            for package in required_packages:
                try:
                    version(package)
                except PackageNotFoundError:
                    missing.append(package)
            if mismatched:
                raise RuntimeError(
                    "Entorno CPU incompleto o con paquetes CUDA: "
                    + ", ".join(mismatched)
                    + ". Ejecuta `make setup`."
                )
            if missing:
                raise RuntimeError(
                    "Faltan dependencias del pipeline: "
                    + ", ".join(missing)
                    + ". Ejecuta `make setup`."
                )
            required = [
                settings.prompt_dir / "personaje.json",
                settings.prompt_dir / "escenas.json",
                settings.prompt_dir / "guiones.json",
            ]
            missing = [str(path.relative_to(settings.root)) for path in required if not path.is_file()]
            if missing:
                raise FileNotFoundError("Faltan archivos: " + ", ".join(missing))
            if shutil.which("ffmpeg") is None:
                raise RuntimeError(
                    "ffmpeg no está disponible en PATH; no se instala desde el pipeline."
                )
            print(
                f"Pipeline listo | perfil={settings.profile} | device=cpu | "
                f"torch={expected_cpu_packages['torch']} | ffmpeg=ok"
            )
            return 0
        if args.command == "preparar-dataset":
            from src.lora.preparar_dataset import prepare_dataset

            print(prepare_dataset(args.personaje))
        elif args.command == "voz":
            from src.voz import generate_voice

            for path in generate_voice(args.guiones, args.referencia):
                print(path)
        elif args.command == "generar-local":
            from src.generar_local import generate

            print(generate(
                args.prompt, args.salida, negative_prompt=args.negativo,
                seed=args.semilla, steps=args.pasos, width=args.ancho, height=args.alto,
            ))
        elif args.command == "imgs":
            for path in _images(args.personaje, args.escenas):
                print(path)
        elif args.command == "lora-entrenar":
            _run_modal(
                "src/lora/modal_entrenar.py",
                "--character", args.personaje,
                "--steps", str(args.pasos),
                "--dataset", str(settings.prepared_dataset_dir / args.personaje),
            )
        elif args.command == "video":
            from src.ensamblar import assemble

            print(assemble(args.imagen, args.audio, args.salida))
        elif args.command == "catalogo":
            from src.catalogo import register_asset

            print(json.dumps(register_asset(args.archivo, args.tipo), ensure_ascii=False))
        elif args.command == "todo":
            _todo(args.personaje, args.escenas, args.guiones)
        return 0
    except (
        ImportError, KeyError, OSError, TypeError, ValueError, RuntimeError, PermissionError,
        NotImplementedError,
    ) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
