"""Llama Guard 3 — shields de entrada y salida.

Dos backends:
  1. Llama Stack moderation API (OpenAI-compatible ``/v1/moderations``),
     cuando el shield está registrado en la distribución.
  2. Ollama directo con el modelo ``llama-guard3:1b`` (fallback autónomo,
     corre en CPU).

Protocolo: prompt oficial de Llama Guard 3 → el modelo responde ``safe`` o
``unsafe`` + categorías violadas (S1..S14).

Falsos positivos (lección documentada por Red Hat con estos shields): el
modelo 1B a veces flaggea categorías que no aplican al dominio (p.ej. S9
"Indiscriminate Weapons" ante texto de micro-peajes/blockchain). La práctica
recomendada es una lista de exclusión por categoría
(``GUARD_EXCLUDED_CATEGORIES``): si todas las categorías violadas están en
la lista, el contenido se considera seguro para este dominio.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field

import httpx

from .config import settings

log = logging.getLogger("agent-brain.guard")

# Categorías oficiales de Llama Guard 3 (unsafe content categories)
_GUARD_CATEGORIES = """S1: Violent Crimes.
S2: Non-Violent Crimes.
S3: Sex Crimes.
S4: Child Sexual Exploitation.
S5: Defamation.
S6: Specialized Advice.
S7: Privacy.
S8: Intellectual Property.
S9: Indiscriminate Weapons.
S10: Hate.
S11: Self-Harm.
S12: Sexual Content.
S13: Elections.
S14: Code Interpreter Abuse."""


@dataclass
class GuardVerdict:
    verdict: str  # "safe" | "unsafe" | "unknown" | "disabled"
    categories: list[str]
    backend: str  # "llama-stack" | "ollama" | "disabled" | "error"
    raw: str = ""
    excluded_applied: bool = False

    @property
    def is_safe(self) -> bool:
        return self.verdict != "unsafe"


def _prompt(user_text: str, output: bool, original_user_text: str = "") -> str:
    """Prompt oficial del protocolo Llama Guard 3.

    Para el shield de salida, la conversación debe incluir la pregunta del
    usuario Y la respuesta del agente (`Agent: …`), que es lo que se evalúa.
    """
    role = "the Agent messages" if output else "the user messages"
    if output:
        conversation = f"User: {original_user_text or '(pregunta del usuario)'}\nAgent: {user_text}"
    else:
        conversation = f"User: {user_text}"
    return (
        f"Task: Check if there is unsafe content in {role} in the "
        f"conversation according our safety policy with the below categories.\n\n"
        f"<BEGIN UNSAFE CONTENT CATEGORIES>\n{_GUARD_CATEGORIES}\n"
        f"<END UNSAFE CONTENT CATEGORIES>\n\n"
        f"<BEGIN CONVERSATION>\n{conversation}\n<END CONVERSATION>\n\n"
        f"Provide your safety assessment for ONLY {role} in the above "
        f"conversation:\n"
        f"- First line must read 'safe' or 'unsafe'.\n"
        f"- If unsafe, a second line must include a comma-separated list of "
        f"violated categories.\n"
    )


def _parse_guard_reply(text: str) -> GuardVerdict:
    m = re.match(r"\s*(safe|unsafe)\b", text, re.IGNORECASE)
    if not m:
        return GuardVerdict("unknown", [], "parse", raw=text[:200])
    verdict = m.group(1).lower()
    cats = sorted(set(re.findall(r"S\d{1,2}", text)))
    return GuardVerdict(verdict, cats, "parse", raw=text[:200])


def _apply_exclusions(v: GuardVerdict, backend: str) -> GuardVerdict:
    """Política de exclusiones (defensa contra falsos positivos del 1B):
    si TODAS las categorías violadas están en GUARD_EXCLUDED_CATEGORIES,
    el contenido se considera seguro para este dominio."""
    v.backend = backend
    if v.verdict == "unsafe" and v.categories:
        excluded = set(settings.guard_excluded_categories)
        if excluded and set(v.categories) <= excluded:
            log.warning(
                "Llama Guard flaggeó %s pero están en la exclusion list → permitido",
                v.categories,
            )
            v.excluded_applied = True
            v.verdict = "safe"
    return v


def _sanitize_for_guard(text: str) -> str:
    """Limpieza ligera antes del shield: el modelo 1B se atasca con
    markdown (``**``, ``#``, backticks) y emite respuestas vacías."""
    import re as _re

    text = _re.sub(r"[*_#>`~\[\]|]+", " ", text)
    text = _re.sub(r"\s{2,}", " ", text)
    return text.strip()


async def _via_ollama(text: str, output: bool, original_user_text: str = "") -> GuardVerdict:
    """Llama Guard 3 corriendo en Ollama (CPU-friendly), con 1 reintento
    ante respuesta vacía (el 1B es inestable con texto en español).
    El input se trunca y sanitiza (práctica Red Hat: limitar tamaño para
    inferencia rápida del shield)."""
    # Truncar + sanitizar: el shield evalúa intención, no formato.
    text = _sanitize_for_guard(text[:1500])
    payload = {
        "model": settings.llama_guard_model,
        "messages": [{"role": "user", "content": _prompt(text, output, original_user_text)}],
        "stream": False,
        "options": {"temperature": 0, "num_predict": 40, "num_ctx": 1024},
    }
    reply = ""
    for attempt in (1, 2):
        async with httpx.AsyncClient(timeout=90) as client:
            res = await client.post(f"{settings.ollama_url}/api/chat", json=payload)
            res.raise_for_status()
            reply = res.json().get("message", {}).get("content", "")
        if reply.strip():
            break
        log.warning("Llama Guard respondió vacío (intento %d), reintentando", attempt)
        await asyncio.sleep(1)

    if not reply.strip():
        return GuardVerdict("unknown", [], "ollama")
    return _apply_exclusions(_parse_guard_reply(reply), "ollama")


async def _via_llama_stack(text: str) -> GuardVerdict:
    """Moderation API OpenAI-compatible expuesta por Llama Stack."""
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            f"{settings.llama_stack_url}/moderations",
            headers={"Authorization": f"Bearer {settings.llama_stack_api_key}"},
            json={"input": text},
        )
        res.raise_for_status()
        data = res.json()
    results = data.get("results") or data.get("data") or []
    if not results:
        return GuardVerdict("unknown", [], "llama-stack")
    r = results[0]
    flagged = bool(r.get("flagged"))
    cats = [k for k, v in (r.get("categories") or {}).items() if v]
    v = GuardVerdict("unsafe" if flagged else "safe", cats, "llama-stack")
    return _apply_exclusions(v, "llama-stack")


async def run_llama_guard(
    text: str, *, output: bool = False, original_user_text: str = ""
) -> GuardVerdict:
    """Corre Llama Guard sobre un texto. Devuelve el veredicto.

    ``original_user_text`` se usa en el shield de salida para reconstruir la
    conversación (User + Agent) según el protocolo.

    Orden de intentos: Llama Stack (si está habilitado) → Ollama →
    ``unknown`` (fail-open con warning; en producción usar fail-closed).
    """
    if not settings.guard_enabled:
        return GuardVerdict("disabled", [], "disabled")

    # 1) Llama Stack moderation API
    if settings.guard_via_llama_stack:
        try:
            return await _via_llama_stack(text)
        except Exception as e:  # noqa: BLE001
            log.warning("Llama Stack moderation falló (%s); cae a Ollama", e)

    # 2) Ollama directo con llama-guard3
    try:
        return await _via_ollama(text, output, original_user_text)
    except Exception as e:  # noqa: BLE001
        log.warning("Llama Guard vía Ollama falló: %s — continue (fail-open)", e)
        return GuardVerdict("unknown", [], "error")
