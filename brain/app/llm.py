"""Cliente LLM — Llama Stack (global) o el proveedor DE LA CUENTA (multi-tenant).

Fase 5: si la petición llega autenticada (Bearer) y la cuenta configuró su
proveedor (nvidia-nim / openai / custom …), el razonamiento usa ESE
proveedor con SUS modelos y SU api_key. Sin cuenta → Llama Stack global
(fallback Ollama), como siempre.

Loop del orquestador (tool-calling):
  1. El modelo razona la intención y emite ``tool_calls``.
  2. El orquestador ejecuta cada tool contra agent-os-api (guard x402
     reactivo: 402 → pago delegado de la cuenta → reintento con X-Payment).
  3. Los resultados vuelven al modelo como mensajes ``role=tool``.
  4. Se repite hasta respuesta final o ``MAX_TOOL_ITERATIONS``.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

import httpx
from openai import AsyncOpenAI

from .config import settings
from .context import AccountContext
from .tools import RunEvents, ToolResult, execute_tool, tools_openai_schemas

log = logging.getLogger("agent-brain.llm")

SYSTEM_PROMPT = (
    "Eres Muse, el agente operativo del dispositivo ESP32-S3-Touch-AMOLED-1.43. "
    "Razonas la intención del usuario en español y orquestas las herramientas "
    "disponibles (estado del dispositivo, Solana, micro-peajes x402, modelo 3D en R2) "
    "de forma autónoma. Usa las herramientas cuando aporten datos reales en vez de "
    "inventar la respuesta. Responde de forma breve, concreta y en español. "
    "Cuando menciones cifras (balance en SOL, lamports, slots), cita el dato exacto "
    "que te devolvieron las herramientas."
)


def _account_prompt(ctx: AccountContext) -> str:
    """Contexto de identidad para el LLM (paso «Identidad» del diagrama)."""
    parts = [
        f"Operas como orquestador de la cuenta «{ctx.email}» ({ctx.account_id})."
    ]
    if ctx.network:
        parts.append(f"Red activa de la cuenta: {ctx.network}.")
    if ctx.wallet:
        parts.append(f"Wallet del orquestador: {ctx.wallet}.")
    if ctx.chain and ctx.chain.get("daily_limit_lamports"):
        parts.append(f"Límite diario dPaaS: {ctx.chain['daily_limit_lamports']} lamports.")
    parts.append(
        "Los micro-peajes x402 de los recursos protegidos se pagan automáticamente "
        "con la wallet delegada de la cuenta; si una tool reporta que el pago está "
        "en verificación on-chain, dilo al usuario con la firma de la transacción."
    )
    return " ".join(parts)


@dataclass
class AgentRun:
    reply: str
    tools_used: list[str] = field(default_factory=list)
    iterations: int = 0
    backend: str = ""  # "llama-stack" | "ollama" | "account:<provider>"
    model: str = ""
    error: str = ""
    x402_events: list[dict] = field(default_factory=list)


async def _llama_stack_alive() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            res = await client.get(
                f"{settings.llama_stack_url}/models",
                headers={"Authorization": f"Bearer {settings.llama_stack_api_key}"},
            )
            return res.status_code == 200
    except Exception:  # noqa: BLE001
        return False


async def _resolve_backend(ctx: AccountContext | None) -> tuple[AsyncOpenAI, str, str]:
    """Devuelve (cliente, backend, modelo).

    Orden: LLM de la cuenta (si existe) → Llama Stack → Ollama.
    """
    if ctx and ctx.llm_base_url and ctx.llm_model:
        client = AsyncOpenAI(
            base_url=ctx.llm_base_url,
            api_key=ctx.llm_api_key,
            timeout=120,
        )
        return client, f"account:{ctx.llm_provider}", ctx.llm_model

    if await _llama_stack_alive():
        client = AsyncOpenAI(
            base_url=settings.llama_stack_url,
            api_key=settings.llama_stack_api_key,
            timeout=120,
        )
        return client, "llama-stack", settings.llm_model

    # Fallback: Ollama expone /v1 (OpenAI-compatible)
    client = AsyncOpenAI(base_url=f"{settings.ollama_url}/v1", api_key="ollama", timeout=300)
    return client, "ollama", settings.llm_model


async def run_agent(
    user_text: str,
    *,
    extra_instructions: str = "",
    ctx: AccountContext | None = None,
) -> AgentRun:
    """Ejecuta el ciclo agéntico completo: razonar → tool-calls → responder."""
    events = RunEvents()
    client, backend, model = await _resolve_backend(ctx)
    run = AgentRun(reply="", backend=backend, model=model)

    # Tienda de dapps: incorpora las tools de las apps INSTALADAS al
    # catálogo (TTL 60 s; best-effort — sin worker el agente sigue).
    from . import mcp
    await mcp.refresh()

    system = SYSTEM_PROMPT
    if ctx:
        system += "\n" + _account_prompt(ctx)
    if extra_instructions:
        system += f"\n{extra_instructions}"

    messages: list[dict] = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_text},
    ]
    schemas = tools_openai_schemas()

    try:
        for iteration in range(1, settings.max_tool_iterations + 1):
            run.iterations = iteration
            completion = await client.chat.completions.create(
                model=model,
                messages=messages,
                tools=schemas,
                temperature=0.3,
            )
            choice = completion.choices[0]
            msg = choice.message

            if not msg.tool_calls:
                run.reply = (msg.content or "").strip()
                run.x402_events = events.x402
                return run

            messages.append(
                {
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments or "{}",
                            },
                        }
                        for tc in msg.tool_calls
                    ],
                }
            )

            for tc in msg.tool_calls:
                run.tools_used.append(tc.function.name)
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}

                log.info("tool-call #%d: %s(%s)", iteration, tc.function.name, args)
                try:
                    result = await execute_tool(tc.function.name, args, ctx=ctx, events=events)
                except Exception as e:  # noqa: BLE001 — robustez: un LLM que
                    # llama la tool con args inválidos no debe tumbar la corrida
                    log.warning("tool «%s» falló (¿args inválidos del LLM?): %s", tc.function.name, e)
                    result = ToolResult(
                        False, None,
                        f"error ejecutando {tc.function.name}: {e}",
                    )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result.as_tool_message(),
                    }
                )

        messages.append(
            {
                "role": "user",
                "content": "Resume ahora mismo lo que tienes, sin llamar más herramientas.",
            }
        )
        completion = await client.chat.completions.create(
            model=model, messages=messages, temperature=0.3
        )
        run.reply = (completion.choices[0].message.content or "").strip()
        run.x402_events = events.x402
        return run

    except Exception as e:  # noqa: BLE001
        log.error("run_agent error: %s", e)
        run.error = str(e)
        run.x402_events = events.x402
        return run
