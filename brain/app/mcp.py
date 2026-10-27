"""mcp.py — MCP manager del orquestador (NomikOS · tienda de dapps).

Las dapps INSTALADAS en el worker (POST /api/apps/{slug}/install)
publican sus tools en el catálogo del api; este módulo las incorpora al
registro del agente en cada turno (TTL 60 s): el LLM las ve junto a las
tools fijas y cada llamada corre por `POST /app/request` → **peaje x402
de la cuenta** (guarded_call de `tools.py` lo paga y reintenta solo).

Sin import circular: registra las tools dinámicas directamente en
`tools.TOOLS` (execute_tool y tools_openai_schemas las ven sin cambios).
"""
import logging
import time
from typing import Any

import httpx

from .config import settings
from .tools import Tool, _call_api

log = logging.getLogger("agent-brain.mcp")

_TTL = 60.0
_cache: dict[str, Any] = {"at": 0.0, "dynamic": {}}


async def refresh() -> None:
    """Refresca el catálogo de tools de dapps instaladas (TTL de 60 s).

    Fast-path: si el cache es fresco, no toca la red. Si el worker no
    responde, el agente sigue con las tools fijas (log de warning).
    """
    if _cache["dynamic"] and time.time() - _cache["at"] < _TTL:
        return

    apps: list[dict] = []
    try:
        base = settings.agent_os_api_url.rstrip("/")
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{base}/apps")
            r.raise_for_status()
            apps = r.json().get("apps") or []
    except Exception as e:  # noqa: BLE001 — el catálogo es best-effort
        log.warning("mcp: sin catálogo del worker (%s)", e)
        return

    # registrar en tools.TOOLS (quitando las de la pasada anterior)
    from .tools import TOOLS  # aquí (post-import) para mutar el registro

    for name in _cache["dynamic"]:
        TOOLS.pop(name, None)
    dynamic: dict[str, Tool] = {}
    for app in apps:
        if app.get("status") != "installed":
            continue
        slug = app.get("slug") or ""
        for spec in app.get("tools") or []:
            name = spec.get("name")
            if not name:
                continue
            dynamic[name] = Tool(
                name=name,
                description=(
                    f"{spec.get('description', '')} "
                    f"(dapp instalada: {app.get('name', slug)} — cada llamada paga su peaje x402)"
                ).strip(),
                parameters=spec.get("parameters")
                or {"type": "object", "properties": {}, "required": []},
                handler=_make_handler(slug, spec.get("call") or {}),
            )
    TOOLS.update(dynamic)
    _cache["dynamic"] = dynamic
    _cache["at"] = time.time()
    if dynamic:
        log.info("mcp: %d tools de dapps instaladas → %s", len(dynamic), ", ".join(dynamic))


def dynamic_tools() -> dict[str, Tool]:
    """Las tools de dapps instaladas (para diagnóstico: GET /v1/tools)."""
    return dict(_cache["dynamic"])


def _render(tpl: str, args: dict[str, Any]) -> str:
    out = str(tpl)
    for k, v in (args or {}).items():
        out = out.replace("{" + k + "}", str(v))
    return out


def _make_handler(slug: str, call: dict[str, Any]):
    """Handler de la tool dinámica → app_request peajizado (la cuenta paga)."""
    method = call.get("method", "GET")
    path_tpl = call.get("path", "/")
    body_tpl = call.get("body")

    async def _handler(ctx=None, ev=None, **kwargs: Any) -> Any:
        path = _render(path_tpl, kwargs)
        body = None
        if isinstance(body_tpl, dict):
            body = {}
            for k, v in body_tpl.items():
                rv = _render(v, kwargs) if isinstance(v, str) else v
                # placeholder intacto (arg omitido) → no enviar la clave:
                # evita mandar "{email}" literales en updates parciales
                if isinstance(v, str) and v == rv and v.startswith("{") and v.endswith("}"):
                    continue
                body[k] = rv
        return await _call_api(
            "/app/request",
            method="POST",
            body={"app": slug, "path": path, "method": method, "body": body},
            ctx=ctx,
            events=ev,
        )

    return _handler
