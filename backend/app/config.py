import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env", override=False)


def database_path() -> Path:
    path = Path(os.getenv("SENSORGUARD_DB", "backend/data/sensorguard.db"))
    return path if path.is_absolute() else ROOT / path


def device_key() -> str:
    return os.getenv("SENSORGUARD_DEVICE_KEY", "").strip()
