"""Configuración de agent-brain por entorno (.env)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # lee agent-brain/.env


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

    # Llama Stack (OpenAI-compatible)
    llama_stack_url: str = os.getenv("LLAMA_STACK_URL", "http://localhost:8321/v1").rstrip("/")
    llama_stack_api_key: str = os.getenv("LLAMA_STACK_API_KEY", "fake")
    llm_model: str = os.getenv("LLM_MODEL", "llama3.2:3b")

    # Ollama (fallback inference + Llama Guard directo)
    ollama_url: str = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")

    # Muse CLI (proveedor local vía `muse exec`)
    muse_bin: str = os.getenv("MUSE_BIN", "")

    # Llama Guard shields
    guard_enabled: bool = field(default_factory=lambda: _bool("GUARD_ENABLED", True))
    llama_guard_model: str = os.getenv("LLAMA_GUARD_MODEL", "llama-guard3:1b")
    guard_via_llama_stack: bool = field(default_factory=lambda: _bool("GUARD_VIA_LLAMA_STACK", False))
    # Categorías cuya violación NO bloquea (práctica Red Hat contra falsos
    # positivos del 1B en dominios técnicos: software/IP→S8, peajes→S9).
    guard_excluded_categories: list[str] = field(
        default_factory=lambda: [
            c.strip().upper()
            for c in os.getenv("GUARD_EXCLUDED_CATEGORIES", "S6,S8,S9,S14").split(",")
            if c.strip()
        ]
    )

    # Orquestador
    max_tool_iterations: int = field(default_factory=lambda: _int("MAX_TOOL_ITERATIONS", 8))


settings = Settings()
