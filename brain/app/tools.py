"""Herramientas del agente — puente HTTP hacia agent-os-api (api).

Fase 5: TODAS las llamadas a la API pasan por el guard x402 reactivo:
si un recurso responde 402, el handshake delegado (dPaaS de la cuenta)
paga y reintenta con X-Payment. Sin cuenta autenticada → modo manual.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import settings
from .context import AccountContext
from .x402 import GuardedResult, X402Outcome, guarded_call

log = logging.getLogger("agent-brain.tools")


@dataclass
class ToolResult:
    ok: bool
    data: Any
    error: str = ""
    x402: dict | None = None  # outcome del handshake (si hubo 402)

    def as_tool_message(self) -> str:
        payload = {"ok": self.ok}
        if self.ok:
            payload["data"] = self.data
        else:
            payload["error"] = self.error
        if self.x402:
            payload["x402"] = self.x402
        return json.dumps(payload, ensure_ascii=False, default=str)[:4000]


@dataclass
class RunEvents:
    """Outcomes x402 de la corrida (para la respuesta del gateway)."""
    x402: list[dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Llamada base: guard x402 reactivo en TODAS las rutas de la API
# ---------------------------------------------------------------------------

def _from_guarded(g: GuardedResult, events: RunEvents | None = None) -> ToolResult:
    """Convierte el resultado del guard en ToolResult, registrando el outcome."""
    if g.x402.status != "skipped" and events is not None:
        events.x402.append(g.x402.as_dict())
    if g.status_code >= 400:
        detail = ""
        if g.x402.status in ("manual", "verifying"):
            # El handshake dejó mensaje útil (pay_hint o estado del pago delegado).
            return ToolResult(False, None, g.x402.detail, x402=g.x402.as_dict())
        if isinstance(g.data, dict):
            detail = str(g.data.get("error", g.data))[:300]
        else:
            detail = str(g.data)[:300] if g.data else ""
        return ToolResult(False, None, f"HTTP {g.status_code}: {detail}", x402=g.x402.as_dict() or None)
    return ToolResult(True, g.data, x402=g.x402.as_dict() if g.x402.status != "skipped" else None)


async def _call_api(
    path: str,
    *,
    method: str = "GET",
    body: dict | None = None,
    ctx: AccountContext | None = None,
    events: RunEvents | None = None,
) -> ToolResult:
    """HTTP a agent-os-api con handshake x402 reactivo."""
    try:
        g = await guarded_call(path, method=method, body=body, ctx=ctx)
    except Exception as e:  # noqa: BLE001
        return ToolResult(False, None, str(e))
    return _from_guarded(g, events)


# ---------------------------------------------------------------------------
# Implementaciones (cada una habla con un endpoint real de agent-os-api)
# ---------------------------------------------------------------------------

async def _get_navbar_status(ctx, ev, **_: Any) -> ToolResult:
    return await _call_api("/navbar", ctx=ctx, events=ev)


async def _get_device(ctx, ev, **_: Any) -> ToolResult:
    return await _call_api("/device", ctx=ctx, events=ev)


async def _get_health(ctx, ev, **_: Any) -> ToolResult:
    return await _call_api("/health", ctx=ctx, events=ev)


async def _solana_status(network: str | None = None, ctx=None, ev=None, **_: Any) -> ToolResult:
    qs = f"?network={network}" if network else ""
    return await _call_api(f"/solana/status{qs}", ctx=ctx, events=ev)


async def _solana_urls(ctx, ev, **_: Any) -> ToolResult:
    return await _call_api("/config/solana/urls", ctx=ctx, events=ev)


async def _x402_summary(ctx, ev, **_: Any) -> ToolResult:
    return await _call_api(
        "/agent/call", method="POST", body={"tool": "x402_summary", "args": {}},
        ctx=ctx, events=ev,
    )


async def _fleet_status(ctx, ev, **_: Any) -> ToolResult:
    """Flota de dispositivos de la cuenta (NomikOS Fase 1): estado
    online/offline, board, versión del agentd y límites por dispositivo."""
    return await _call_api("/devices", ctx=ctx, events=ev)


async def _place_call(destination: str, ctx=None, ev=None, **_: Any) -> ToolResult:
    """NomikOS Fase 5: inicia una llamada al destino. Cada minuto es un
    peaje x402 que la cuenta paga por dPaaS (402 → pago delegado →
    reintento automático); la respuesta trae el peaje del minuto siguiente."""
    return await _call_api(
        "/calls", method="POST", body={"destination": destination},
        ctx=ctx, events=ev,
    )


async def _end_call(id: str, ctx=None, ev=None, **_: Any) -> ToolResult:
    from urllib.parse import quote

    return await _call_api(
        f"/calls/{quote(id)}/end", method="POST", body={},
        ctx=ctx, events=ev,
    )


async def _app_request(path: str, method: str = "GET", body: dict | None = None, ctx=None, ev=None, **_: Any) -> ToolResult:
    """NomikOS F5 (diagram.d2 paso 6): tool call a la APP del ecosistema
    — Payload CMS (colecciones: /api/users, /api/media, …). CADA petición
    cobra un micro-peaje x402 que la cuenta paga por dPaaS (402 → pago
    delegado → reintento automático con X-Payment)."""
    return await _call_api(
        "/app/request", method="POST",
        body={"path": path, "method": method, "body": body},
        ctx=ctx, events=ev,
    )


async def _x402_create_invoice(resource: str, amount_lamports: int, ctx=None, ev=None, **_: Any) -> ToolResult:
    return await _call_api(
        "/x402/invoices", method="POST",
        body={"resource": resource, "amount_lamports": amount_lamports},
        ctx=ctx, events=ev,
    )


async def _x402_invoice_status(id: str, ctx=None, ev=None, **_: Any) -> ToolResult:
    from urllib.parse import quote

    return await _call_api(f"/x402/invoices/{quote(id)}", ctx=ctx, events=ev)


async def _x402_pay_toll(to: str, lamports: int, memo: str | None = None, ctx=None, ev=None, **_: Any) -> ToolResult:
    return await _call_api(
        "/x402/pay", method="POST",
        body={"to": to, "lamports": lamports, "memo": memo},
        ctx=ctx, events=ev,
    )


async def _x402_payouts(ctx, ev, **_: Any) -> ToolResult:
    return await _call_api("/x402/payouts", ctx=ctx, events=ev)


# ---------------------------------------------------------------------------
# Muse CLI — proveedor local de razonamiento (agente MSP, `muse exec`)
# ---------------------------------------------------------------------------

async def _ask_muse(question: str, **_: Any) -> ToolResult:
    import asyncio

    if not settings.muse_bin or not Path(settings.muse_bin).exists():
        return ToolResult(False, None, "Muse CLI no configurado (MUSE_BIN)")

    try:
        proc = await asyncio.create_subprocess_exec(
            settings.muse_bin, "exec", question,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out_b, err_b = await asyncio.wait_for(proc.communicate(), timeout=90)
        out = out_b.decode(errors="replace").strip()
        err = err_b.decode(errors="replace").strip()
        if proc.returncode == 0 and out:
            return ToolResult(True, {"reply": out[-2000:]})
        detail = err.strip().splitlines()[-1] if err else f"exit {proc.returncode}"
        return ToolResult(False, None, f"muse exec falló: {detail[:200]}")
    except asyncio.TimeoutError:
        return ToolResult(False, None, "muse exec: timeout (90s)")
    except Exception as e:  # noqa: BLE001
        return ToolResult(False, None, f"muse exec: {e}")


# ---------------------------------------------------------------------------
# Registro de herramientas: schema (LLM) + implementación
# ---------------------------------------------------------------------------

@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    handler: Any

    def openai_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


def _p(props: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": props, "required": required}


TOOLS: dict[str, Tool] = {
    "get_navbar_status": Tool(
        name="get_navbar_status",
        description=(
            "Estado agregado del Agente OS: dispositivo, ERP (semáforo) y Solana "
            "(red, wallet, balance). Puede requerir micro-peaje x402 (se paga solo)."
        ),
        parameters=_p({}, []),
        handler=_get_navbar_status,
    ),
    "get_device": Tool(
        name="get_device",
        description=(
            "Ficha técnica del dispositivo ESP32-S3-Touch-AMOLED-1.43 y metadatos "
            "del modelo 3D en Cloudflare R2. Protegida por micro-peaje x402."
        ),
        parameters=_p({}, []),
        handler=_get_device,
    ),
    "get_health": Tool(
        name="get_health",
        description="Salud general de la API: uptime, módulos activos y versión.",
        parameters=_p({}, []),
        handler=_get_health,
    ),
    "solana_status": Tool(
        name="solana_status",
        description="Estado de la red Solana: running, validador, slot y balance de la wallet.",
        parameters=_p(
            {
                "network": {
                    "type": "string",
                    "enum": ["local", "devnet", "testnet", "mainnet"],
                    "description": "Red a consultar (opcional)",
                }
            },
            [],
        ),
        handler=_solana_status,
    ),
    "solana_urls": Tool(
        name="solana_urls",
        description="URLs RPC de Solana por red (fuente única de verdad).",
        parameters=_p({}, []),
        handler=_solana_urls,
    ),
    "x402_summary": Tool(
        name="x402_summary",
        description="Resumen del módulo x402: facturas de micro-peajes, liquidaciones y wallet cobradora.",
        parameters=_p({}, []),
        handler=_x402_summary,
    ),
    "fleet_status": Tool(
        name="fleet_status",
        description=(
            "Flota de dispositivos IoT de la cuenta (NomikOS): estado online/offline, "
            "placa, versión del agentd y límites x402 por dispositivo."
        ),
        parameters=_p({}, []),
        handler=_fleet_status,
    ),
    "place_call": Tool(
        name="place_call",
        description=(
            "Inicia una llamada (voz) a un destino (número E.164 o URI SIP). "
            "Cada minuto se cobra como micro-peaje x402 que la cuenta paga por dPaaS; "
            "la llamada avanza cuando el peaje se liquida y el siguiente llega en la respuesta."
        ),
        parameters=_p(
            {"destination": {"type": "string", "description": "Destino: +573001234567 o sip:usuario@dominio"}},
            ["destination"],
        ),
        handler=_place_call,
    ),
    "end_call": Tool(
        name="end_call",
        description="Finaliza (cuelga) una llamada en curso por su id.",
        parameters=_p(
            {"id": {"type": "string", "description": "Id de la llamada (call-…)"}},
            ["id"],
        ),
        handler=_end_call,
    ),
    "app_request": Tool(
        name="app_request",
        description=(
            "Hace una petición a la APP del ecosistema (Payload CMS, el ERP): "
            "colecciones REST como /api/users, /api/media, /api/patients… "
            "Cada petición se cobra como micro-peaje x402 que la cuenta paga por dPaaS."
        ),
        parameters=_p(
            {
                "path": {"type": "string", "description": "Ruta interna de la app (ej: /api/users?limit=5)"},
                "method": {"type": "string", "description": "GET | POST | PUT (default GET)"},
                "body": {"type": "object", "description": "Cuerpo JSON para POST/PUT (opcional)"},
            },
            ["path"],
        ),
        handler=_app_request,
    ),
    "x402_create_invoice": Tool(
        name="x402_create_invoice",
        description="Crea una factura de micro-peaje x402 para un recurso.",
        parameters=_p(
            {
                "resource": {"type": "string", "description": "Identificador del recurso"},
                "amount_lamports": {"type": "integer", "description": "Monto en lamports (> 0)"},
            },
            ["resource", "amount_lamports"],
        ),
        handler=_x402_create_invoice,
    ),
    "x402_invoice_status": Tool(
        name="x402_invoice_status",
        description="Consulta el estado on-chain de una factura x402.",
        parameters=_p({"id": {"type": "string", "description": "ID de la factura"}}, ["id"]),
        handler=_x402_invoice_status,
    ),
    "x402_pay_toll": Tool(
        name="x402_pay_toll",
        description="Encola una liquidación SOL saliente firmada en background (dPaaS de la cuenta).",
        parameters=_p(
            {
                "to": {"type": "string", "description": "Pubkey base58 del destinatario"},
                "lamports": {"type": "integer", "description": "Monto en lamports (> 0)"},
                "memo": {"type": "string", "description": "Memo opcional"},
            },
            ["to", "lamports"],
        ),
        handler=_x402_pay_toll,
    ),
    "x402_payouts": Tool(
        name="x402_payouts",
        description="Lista las liquidaciones salientes (payouts) del módulo x402.",
        parameters=_p({}, []),
        handler=_x402_payouts,
    ),
    "ask_muse": Tool(
        name="ask_muse",
        description=(
            "Consulta al agente Muse local (proveedor MSP) una pregunta directa. "
            "Úsala solo si el usuario pide explícitamente la opinión de Muse."
        ),
        parameters=_p(
            {"question": {"type": "string", "description": "Pregunta concreta para Muse"}},
            ["question"],
        ),
        handler=_ask_muse,
    ),
}


async def execute_tool(
    name: str,
    arguments: dict,
    *,
    ctx: AccountContext | None = None,
    events: RunEvents | None = None,
) -> ToolResult:
    """Ejecuta una herramienta con el contexto de la cuenta (handshake x402
    reactivo incluido en cada llamada a la API)."""
    tool = TOOLS.get(name)
    if not tool:
        return ToolResult(False, None, f"herramienta «{name}» no registrada")

    args = dict(arguments or {})
    # El contexto/eventos se inyectan como kwargs; el handler los acepta.
    try:
        result = await tool.handler(ctx=ctx, ev=events, **args)
    except TypeError:
        # Handlers sin firma ctx/ev (p.ej. ask_muse): llamar sin inyección.
        clean = {k: v for k, v in args.items() if v is not None}
        result = await tool.handler(**clean)
    if not result.ok:
        log.info("tool «%s» → %s", name, (result.error or "")[:120])
    return result


def tools_openai_schemas() -> list[dict]:
    return [t.openai_schema() for t in TOOLS.values()]
