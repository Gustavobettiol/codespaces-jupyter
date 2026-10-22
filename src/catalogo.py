from __future__ import annotations

import csv
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from src.config import settings


def _connect() -> sqlite3.Connection:
    settings.catalog_dir.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(settings.catalog_dir / "catalogo.sqlite3")
    connection.execute("""
        CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            catalog_id TEXT NOT NULL UNIQUE,
            path TEXT NOT NULL UNIQUE,
            media_type TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    return connection


def register_asset(path: Path, media_type: str | None = None) -> dict[str, str]:
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(f"No existe el archivo a catalogar: {path}")
    kind = media_type or {
        ".png": "image", ".jpg": "image", ".jpeg": "image",
        ".wav": "audio", ".mp3": "audio", ".mp4": "video",
    }.get(path.suffix.lower())
    if kind not in {"image", "audio", "video"}:
        raise ValueError("El tipo debe ser image, audio o video.")

    connection = _connect()
    try:
        existing = connection.execute(
            "SELECT catalog_id, path, media_type, created_at FROM assets WHERE path = ?",
            (str(path),),
        ).fetchone()
        if existing:
            current = dict(zip(("catalog_id", "path", "media_type", "created_at"), existing))
        else:
            created_at = datetime.now(timezone.utc).isoformat()
            cursor = connection.execute(
                "INSERT INTO assets (catalog_id, path, media_type, created_at) "
                "VALUES ('pending', ?, ?, ?)",
                (str(path), kind, created_at),
            )
            catalog_id = f"A-{cursor.lastrowid:04d}"
            connection.execute(
                "UPDATE assets SET catalog_id = ? WHERE id = ?",
                (catalog_id, cursor.lastrowid),
            )
            current = {
                "catalog_id": catalog_id,
                "path": str(path),
                "media_type": kind,
                "created_at": created_at,
            }
        connection.commit()
        rows = connection.execute(
            "SELECT catalog_id, path, media_type, created_at FROM assets ORDER BY id"
        ).fetchall()
    except sqlite3.IntegrityError as error:
        connection.rollback()
        raise RuntimeError(f"No se pudo asignar un número de catálogo: {error}") from error
    finally:
        connection.close()

    fields = ("catalog_id", "path", "media_type", "created_at")
    records = [dict(zip(fields, row)) for row in rows]
    (settings.catalog_dir / "catalogo.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    with (settings.catalog_dir / "catalogo.csv").open(
        "w", newline="", encoding="utf-8"
    ) as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)
    return current
