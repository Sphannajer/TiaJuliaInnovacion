"""Model persistence with joblib and explicit versioning (sección 30.3)."""

import json
from datetime import date
from pathlib import Path

import joblib

from app.core.config import settings

META_SUFFIX = ".meta.json"


def model_version(prefix: str, day: date | None = None) -> str:
    day = day or date.today()
    return f"{prefix}-{day.isoformat()}"


def save_model(name: str, model, metadata: dict) -> str:
    """Save model + metadata; returns the model version string."""
    directory = settings.model_dir_path
    path = directory / f"{name}.joblib"
    joblib.dump(model, path)
    meta_path = directory / f"{name}{META_SUFFIX}"
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2, default=str))
    return metadata.get("model_version", name)


def load_model(name: str):
    path = settings.model_dir_path / f"{name}.joblib"
    if not path.exists():
        return None
    return joblib.load(path)


def load_metadata(name: str) -> dict | None:
    meta_path = settings.model_dir_path / f"{name}{META_SUFFIX}"
    if not meta_path.exists():
        return None
    return json.loads(meta_path.read_text())
