"""Configuración de agent-brain por entorno (.env)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")  # único .env en la raíz


def _bool(key: str, default: bool) -> bool:
    return os.getenv(key, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, str(default)))
    except ValueError:
        return default


@dataclass
class Settings:
    # agent-os-api
    agent_os_api_url: str = os.getenv("AGENT_OS_API_URL", "http://localhost:8080/api").rstrip("/")

    # Muse CLI (proveedor local vía `muse exec`)
    muse_bin: str = os.getenv("MUSE_BIN", "")

    # Llama Guard remoto: proveedor y conexión exclusivamente desde el .env raíz.
    guard_provider: str = os.getenv("GUARD_PROVIDER", "").strip()
    guard_api_url: str = os.getenv("GUARD_API_URL", "").strip()
    guard_api_key: str = os.getenv("GUARD_API_KEY", "").strip()
    guard_model: str = os.getenv("GUARD_MODEL", "").strip()

    # Moderación de entrada y salida
    guard_enabled: bool = field(default_factory=lambda: _bool("GUARD_ENABLED", True))
    # Categorías cuya violación no bloquea por calibración de falsos positivos
    # del dominio (software/IP→S8, peajes→S9).
    # S7 (Privacy): el agente solo ve datos DE LA PROPIA cuenta (todas las
    # tools llevan el Bearer de la cuenta) y le responde a su dueño.
    # La exclusión exige que TODAS las categorías sean de la lista.
    guard_excluded_categories: list[str] = field(
        default_factory=lambda: [
            c.strip().upper()
            for c in os.getenv("GUARD_EXCLUDED_CATEGORIES", "S6,S7,S8,S9,S14").split(",")
            if c.strip()
        ]
    )

    # Orquestador
    max_tool_iterations: int = field(default_factory=lambda: _int("MAX_TOOL_ITERATIONS", 8))


settings = Settings()
