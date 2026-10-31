"""Llama Guard remoto para moderar entrada y salida.

Proveedor, endpoint, clave y modelo vienen del .env central. El adaptador
usa el formato OpenAI Chat Completions y espera la respuesta safe/unsafe.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import httpx

from .config import settings

log = logging.getLogger("agent-brain.guard")

# Categorías oficiales de Llama Guard 4 (unsafe content categories)
_GUARD_CATEGORIES = """S1: Violent Crimes.
S2: Non-Violent Crimes.
S3: Sex-Related Crimes.
S4: Child Sexual Exploitation.
S5: Defamation.
S6: Specialized Advice.
S7: Privacy.
S8: Intellectual Property.
S9: Indiscriminate Weapons.
S10: Hate.
S11: Suicide & Self-Harm.
S12: Sexual Content.
S13: Elections.
S14: Code Interpreter Abuse (text only)."""


@dataclass
class GuardVerdict:
    verdict: str  # "safe" | "unsafe" | "unknown" | "disabled"
    categories: list[str]
    backend: str  # proveedor configurado | "disabled" | "error"
    raw: str = ""
    excluded_applied: bool = False

    @property
    def is_safe(self) -> bool:
        return self.verdict != "unsafe"


def _prompt(user_text: str, output: bool, original_user_text: str = "") -> str:
    """Prompt oficial del protocolo Llama Guard 4.

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
    """Política de exclusiones para falsos positivos del dominio:
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
    """Limpieza ligera de markdown antes de enviar texto al shield remoto."""
    import re as _re

    text = _re.sub(r"[*_#>`~\[\]|]+", " ", text)
    text = _re.sub(r"\s{2,}", " ", text)
    return text.strip()


async def _via_configured_provider(text: str, output: bool, original_user_text: str = "") -> GuardVerdict:
    """Clasifica entrada/salida con un endpoint OpenAI-compatible configurado."""
    safe_text = _sanitize_for_guard(text[:1500])
    safe_original = _sanitize_for_guard(original_user_text[:1500])
    payload = {
        "model": settings.guard_model,
        "messages": [{
            "role": "user",
            "content": _prompt(safe_text, output, safe_original),
        }],
        "temperature": 0,
        "max_tokens": 64,
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(
            settings.guard_api_url,
            headers={"Authorization": f"Bearer {settings.guard_api_key}"},
            json=payload,
        )
        response.raise_for_status()
        reply = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")

    if not isinstance(reply, str) or not reply.strip():
        return GuardVerdict("unknown", [], settings.guard_provider)
    return _apply_exclusions(_parse_guard_reply(reply), settings.guard_provider)

async def run_llama_guard(
    text: str, *, output: bool = False, original_user_text: str = ""
) -> GuardVerdict:
    """Ejecuta el shield remoto de entrada o salida y devuelve su veredicto.

    original_user_text reconstruye el turno User/Agent del shield de salida.
    Si falta configuración o falla el proveedor, conserva el comportamiento fail-open actual.
    """
    if not settings.guard_enabled:
        return GuardVerdict("disabled", [], "disabled")
    if not all((settings.guard_provider, settings.guard_api_url, settings.guard_api_key, settings.guard_model)):
        log.error("Falta GUARD_PROVIDER, GUARD_API_URL, GUARD_API_KEY o GUARD_MODEL")
        return GuardVerdict("unknown", [], "error")

    try:
        return await _via_configured_provider(text, output, original_user_text)
    except httpx.HTTPStatusError as exc:
        log.warning("Llama Guard devolvió HTTP %s; continúa fail-open", exc.response.status_code)
    except httpx.RequestError as exc:
        log.warning("Proveedor de Llama Guard no disponible (%s); continúa fail-open", type(exc).__name__)
    except Exception as exc:  # noqa: BLE001
        log.warning("Llama Guard no pudo procesar la respuesta (%s); continúa fail-open", type(exc).__name__)
    return GuardVerdict("unknown", [], "error")
