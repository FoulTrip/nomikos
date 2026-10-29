"""Persistencia del uso que los proveedores LLM devuelven en cada completion."""

from __future__ import annotations

import logging

import httpx

from .config import settings
from .context import AccountContext

log = logging.getLogger("agent-brain.usage")


async def persist_llm_usage(
    ctx: AccountContext,
    model: str,
    events: list[dict[str, int]],
) -> None:
    """Envía contadores agregables a la API con el Bearer original.

    La API deriva si el turno viene del simulador usando la sesión de
    dispositivo; este módulo nunca decide ni envía un entorno confiable.
    """
    if not events:
        return

    payload = {
        "provider": ctx.llm_provider or "unknown",
        "model": model,
        "events": events,
    }
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.post(
                f"{settings.agent_os_api_url}/accounts/me/llm-usage",
                headers={"Authorization": f"Bearer {ctx.bearer}"},
                json=payload,
            )
        if response.is_error:
            log.warning(
                "api rechazó el registro de tokens: HTTP %d (%d completions)",
                response.status_code,
                len(events),
            )
    except Exception as exc:  # noqa: BLE001 — el contador no debe tumbar el turno
        log.warning(
            "no se pudo guardar el uso LLM (%d completions): %s",
            len(events),
            exc.__class__.__name__,
        )
