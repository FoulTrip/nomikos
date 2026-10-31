"""Descubrimiento MCP sin estado global entre cuentas.

Las tools legacy del catálogo local siguen pasando por /app/request. Las
tools del marketplace se descubren con el Bearer de la cuenta y cada llamada
va al gateway de precio, permisos y x402 de api.
"""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import quote

import httpx

from .config import settings
from .context import AccountContext
from .tools import Tool, _call_api

log = logging.getLogger("agent-brain.mcp")

_TTL = 20.0
_cache: dict[str, dict[str, Any]] = {}


async def refresh(ctx: AccountContext | None) -> dict[str, Tool]:
    """Devuelve solo tools instaladas/habilitadas para la cuenta de este turno."""
    if ctx is None:
        return {}
    account_id = ctx.account_id
    cached = _cache.get(account_id)
    if cached and time.time() - cached["at"] < _TTL:
        return dict(cached["tools"])

    base = settings.agent_os_api_url.rstrip("/")
    headers = {"Authorization": f"Bearer {ctx.bearer}"}
    dynamic: dict[str, Tool] = {}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            # Compatibilidad con los paquetes locales existentes. Sus
            # ejecuciones siguen teniendo cuenta y pasan por /app/request.
            legacy = await client.get(f"{base}/apps", headers=headers)
            legacy.raise_for_status()
            for app in legacy.json().get("apps") or []:
                if app.get("status") != "installed":
                    continue
                namespace = app.get("slug") or ""
                for spec in app.get("tools") or []:
                    name = spec.get("name")
                    if not name or name in dynamic:
                        continue
                    dynamic[name] = Tool(
                        name=name,
                        description=(
                            f"{spec.get('description', '')} "
                            f"(app local: {app.get('name', namespace)}; cobro por solicitud x402)"
                        ).strip(),
                        parameters=spec.get("parameters")
                        or {"type": "object", "properties": {}, "required": []},
                        handler=_legacy_handler(namespace, spec.get("call") or {}),
                    )
            response = await client.get(f"{base}/accounts/me/marketplace/tools", headers=headers)
            if response.status_code == 401:
                raise PermissionError("Bearer inválido al listar tools MCP")
            response.raise_for_status()
            for spec in response.json().get("tools") or []:
                name = spec.get("name")
                namespace = spec.get("namespace")
                tool_name = spec.get("tool_name")
                schema = spec.get("input_schema")
                if not all(isinstance(v, str) and v for v in (name, namespace, tool_name)):
                    continue
                if not isinstance(schema, dict) or schema.get("type") != "object":
                    continue
                dynamic[name] = Tool(
                    name=name,
                    description=(
                        f"{spec.get('description', '')} "
                        f"Riesgo declarado: {spec.get('risk_class', 'unknown')}. "
                        "El precio exacto se verifica en cada llamada."
                    ).strip(),
                    parameters=schema,
                    handler=_marketplace_handler(namespace, tool_name),
                )
    except PermissionError:
        raise
    except Exception as exc:  # noqa: BLE001 — no usar listas viejas al fallar la API
        log.warning("mcp marketplace: no se pudo descubrir tools de %s (%s)", account_id, exc)
        _cache.pop(account_id, None)
        return {}

    _cache[account_id] = {"at": time.time(), "tools": dynamic}
    if dynamic:
        log.info("mcp: %d tools MCP habilitadas para %s", len(dynamic), account_id)
    return dict(dynamic)


def _marketplace_handler(namespace: str, tool_name: str):
    async def _handler(ctx=None, ev=None, **arguments: Any):
        if ctx is None:
            from .tools import ToolResult
            return ToolResult(False, None, "se requiere cuenta para usar una tool MCP publicada")
        path = (
            f"/marketplace/apps/{quote(namespace, safe='')}/tools/"
            f"{quote(tool_name, safe='')}/call"
        )
        return await _call_api(
            path,
            method="POST",
            body={"arguments": arguments},
            ctx=ctx,
            events=ev,
        )

    return _handler


def _legacy_handler(namespace: str, call: dict[str, Any]):
    method = call.get("method", "GET")
    path_template = call.get("path", "/")
    body_template = call.get("body")

    async def _handler(ctx=None, ev=None, **arguments: Any):
        path = str(path_template)
        for key, value in arguments.items():
            path = path.replace("{" + key + "}", str(value))
        body = None
        if isinstance(body_template, dict):
            body = {}
            for key, value in body_template.items():
                rendered = str(value)
                for arg_name, arg_value in arguments.items():
                    rendered = rendered.replace("{" + arg_name + "}", str(arg_value))
                if isinstance(value, str) and rendered == value and value.startswith("{") and value.endswith("}"):
                    continue
                body[key] = rendered if isinstance(value, str) else value
        return await _call_api(
            "/app/request",
            method="POST",
            body={"app": namespace, "path": path, "method": method, "body": body},
            ctx=ctx,
            events=ev,
        )

    return _handler


def dynamic_tools(account_id: str | None = None) -> dict[str, Tool]:
    """Tools MCP actualmente cacheadas; el endpoint de agente usa cuenta explícita."""
    if account_id is not None:
        item = _cache.get(account_id) or {}
        return dict(item.get("tools") or {})
    merged: dict[str, Tool] = {}
    for item in _cache.values():
        merged.update(item.get("tools") or {})
    return merged
