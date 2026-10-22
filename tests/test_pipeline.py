from __future__ import annotations

import json
import tempfile
import unittest
import wave
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from src import catalogo
from src.config import settings
from src.lora import preparar_dataset
from src.voz import safe_stem


class CatalogTests(unittest.TestCase):
    def test_catalog_ids_are_sequential_and_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "first.png"
            second = root / "second.wav"
            first.write_bytes(b"image")
            second.write_bytes(b"audio")
            with patch.object(catalogo, "settings", replace(settings, catalog_dir=root / "catalog")):
                first_entry = catalogo.register_asset(first)
                repeated = catalogo.register_asset(first)
                second_entry = catalogo.register_asset(second)

            self.assertEqual(first_entry["catalog_id"], "A-0001")
            self.assertEqual(repeated["catalog_id"], "A-0001")
            self.assertEqual(second_entry["catalog_id"], "A-0002")
            self.assertTrue((root / "catalog/catalogo.json").is_file())
            self.assertTrue((root / "catalog/catalogo.csv").is_file())


class DatasetTests(unittest.TestCase):
    def test_preparation_requires_consent_before_processing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "dataset" / "persona"
            source.mkdir(parents=True)
            with patch.object(
                preparar_dataset,
                "settings",
                replace(settings, dataset_dir=root / "dataset"),
            ):
                with self.assertRaises(PermissionError):
                    preparar_dataset.prepare_dataset("persona")

    def test_preparation_resizes_images_and_writes_caption_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "dataset" / "persona"
            source.mkdir(parents=True)
            (source / "CONSENTIMIENTO.txt").write_text(
                "Autorización documentada.", encoding="utf-8"
            )
            for index in range(20):
                Image.new("RGB", (320, 240), (index, 30, 80)).save(
                    source / f"{index:02d}.png"
                )
            local_settings = replace(
                settings,
                dataset_dir=root / "dataset",
                prepared_dataset_dir=root / "prepared",
            )
            with patch.object(preparar_dataset, "settings", local_settings):
                prepared = preparar_dataset.prepare_dataset("persona")

            metadata = [
                json.loads(line)
                for line in (prepared / "metadata.jsonl").read_text().splitlines()
            ]
            self.assertEqual(len(metadata), 20)
            self.assertTrue((prepared / "CONSENTIMIENTO.txt").is_file())
            self.assertIn("sofiaArg", metadata[0]["text"])
            with Image.open(prepared / metadata[0]["file_name"]) as image:
                self.assertEqual(image.size, (1024, 1024))


class UtilityTests(unittest.TestCase):
    def test_safe_stem_normalizes_ids_and_rejects_empty_values(self) -> None:
        self.assertEqual(safe_stem(" bienvenida / voz "), "bienvenida-voz")
        with self.assertRaises(ValueError):
            safe_stem(" / ")

    def test_assembly_uses_ffmpeg_or_reports_missing_binary(self) -> None:
        import shutil

        if shutil.which("ffmpeg") is None:
            from src.ensamblar import assemble

            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                image_path = root / "still.png"
                audio_path = root / "voice.wav"
                Image.new("RGB", (128, 128)).save(image_path)
                audio_path.write_bytes(b"not used")
                with self.assertRaisesRegex(RuntimeError, "ffmpeg"):
                    assemble(image_path, audio_path, root / "result.mp4")
            return

        from src.ensamblar import assemble

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            image_path = root / "still.png"
            audio_path = root / "voice.wav"
            Image.new("RGB", (128, 128), (30, 80, 120)).save(image_path)
            with wave.open(str(audio_path), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(16000)
                audio.writeframes(b"\x00\x00" * 16000)
            output = assemble(image_path, audio_path, root / "result.mp4")
            self.assertGreater(output.stat().st_size, 0)


if __name__ == "__main__":
    unittest.main()
