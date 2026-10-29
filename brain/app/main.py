"""agent-brain — Gateway agéntico de la capa cognitiva.

``POST /v1/agentic-gateway`` orquesta el flujo Zero-UI completo:

  ① Identidad — Bearer → contexto de la cuenta (llm/chain/wallet) en la API.
  ② Shield entrada — Llama Guard 3 clasifica el texto del dispositivo.
  ③ Razonamiento — LLM de la cuenta (o global) con tool-calling.
  ④ x402 reactivo — cada tool pasa el guard: 402 → pago delegado (dPaaS)
     de la cuenta → reintento con X-Payment (el usuario nunca firma).
  ⑤ Shield salida — Llama Guard 3 valida la respuesta antes de emitirla.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .config import settings
from .context import AccountContext, bearer_from_headers, fetch_account_context
from .llm import LLMNotConfigured, run_agent
from .usage import persist_llm_usage
from .shields import GuardVerdict, run_llama_guard
from .tools import TOOLS
from . import legal as legal_gate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("agent-brain")

app = FastAPI(title="agent-brain — Capa Cognitiva", version="2.0.0")


# ─────────────────────────────────────────────────────────────────────────────
# Modelos
# ─────────────────────────────────────────────────────────────────────────────

class AgenticRequest(BaseModel):
    device_id: str = Field(default="ESP32-S3-Touch-AMOLED-1.43")
    text: str = Field(min_length=1, max_length=4000)
    solana_tx_signature: Optional[str] = None  # pago previo (modo manual)


class AgenticResponse(BaseModel):
    ok: bool
    reply: str = ""
    tools_used: list[str] = []
    shield_in: dict = {}
    shield_out: dict = {}
    x402: list[dict] = []
    account: dict = {}
    backend: str = ""
    model: str = ""
    iterations: int = 0
    verification: dict = {}
    artifacts: list[dict] = []


def _verdict_dict(v: GuardVerdict) -> dict:
    return {"verdict": v.verdict, "categories": v.categories, "backend": v.backend}


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/v1/agentic-gateway", response_model=AgenticResponse)
async def agentic_gateway(req: AgenticRequest, request: Request) -> AgenticResponse | JSONResponse:
    log.info("◀ dispositivo «%s»: %s", req.device_id, req.text[:120])

    # ① Identidad — Bearer OBLIGATORIO: sin cuenta no hay LLM (la cuenta
    # es 100% responsable de sus keys; no existe backend global).
    bearer = bearer_from_headers(request.headers)
    if not bearer:
        return JSONResponse(
            {"ok": False, "code": "AUTH_REQUIRED",
             "error": "se requiere sesión de cuenta (Bearer) con proveedor LLM configurado"},
            status_code=401,
        )
    try:
        ctx = await fetch_account_context(bearer)
    except PermissionError as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=401)
    except Exception as e:  # noqa: BLE001
        log.warning("contexto de cuenta falló: %s", e)
        return JSONResponse(
            {"ok": False, "error": f"no pude resolver tu cuenta: {e}"},
            status_code=401,
        )

    # ② Shield entrada: Llama Guard
    shield_in = await run_llama_guard(req.text, output=False)
    if shield_in.verdict == "unsafe":
        log.warning("⛔ Llama Guard bloqueó el input: %s", shield_in.categories)
        return AgenticResponse(
            ok=False,
            reply=(
                "Tu mensaje fue bloqueado por la política de seguridad "
                f"(categorías: {', '.join(shield_in.categories) or 'desconocidas'})."
            ),
            shield_in=_verdict_dict(shield_in),
        )

    # ③ + ④ Ciclo agéntico con tool-calls y x402 reactivo (dPaaS de la cuenta)
    extra = ""
    if req.solana_tx_signature:
        extra = (
            f"El dispositivo adjunta esta firma Solana de un pago x402 previo: "
            f"{req.solana_tx_signature}. Si necesitas verificar un pago, úsala."
        )
    try:
        run = await run_agent(req.text, extra_instructions=extra, ctx=ctx)
    except LLMNotConfigured as e:
        return JSONResponse(
            {"ok": False, "code": "LLM_NOT_CONFIGURED", "error": str(e)},
            status_code=400,
        )

    # Cada completion puede consumir tokens, aunque una tool falle luego, la
    # respuesta sea retenida por un shield o el turno termine sin respuesta.
    await persist_llm_usage(ctx, run.model, run.usage_events)

    if not run.reply:
        log.error("run_agent sin respuesta: %s", run.error)
        return AgenticResponse(
            ok=False,
            reply="No pude razonar la petición: tu proveedor LLM falló. "
                  "Revisa tu api_key y modelo en Modelos del agente.",
            backend=run.backend,
            model=run.model,
            x402=run.x402_events,
        )

    # ④b S2 post-check (defensa en profundidad; el gate pre-ejecución vive en
    # llm.py): efectos en contexto legal exigen run verificado. Además,
    # refusal del agente en contexto legal → auto-escalado a humano.
    verification: dict = {}
    run_id = legal_gate.extract_run_id(req.text, extra)
    legal_tools_used = any(
        t in ("list_case_docs", "read_case_doc", "legal_turn", "submit_memorandum")
        for t in run.tools_used
    )
    effect_used = sorted(set(run.tools_used) & set(legal_gate.EFFECTFUL_TOOLS))
    if run_id:
        data = await legal_gate.fetch_run(ctx, run_id)
        passed, omissions, status, score = legal_gate.run_passed(data)
        omit_ids = [o.get("id", "?") for o in omissions] if isinstance(omissions, list) else []
        verification = {"run_id": run_id, "status": status,
                        "verdict": "pass" if passed else "fail",
                        "omissions": omit_ids, "score": score}
        if effect_used and not passed:
            log.warning("⛔ S2 post-check bloqueó respuesta (efectos %s sin pass en %s)",
                        effect_used, run_id)
            return AgenticResponse(
                ok=False,
                reply=(f"Efectos bloqueados por verificación S2: el run {run_id} está "
                       f"«{status}» con omisiones {omit_ids}. Corrige el memorándum "
                       f"y vuelve a entregar antes de pedir efectos."),
                tools_used=run.tools_used,
                shield_in=_verdict_dict(shield_in),
                backend=run.backend,
                model=run.model,
                iterations=run.iterations,
                x402=run.x402_events,
                verification=verification,
            )
        if (legal_tools_used or legal_gate.is_legal_text(req.text)) and legal_gate.has_refusal(run.reply):
            ok_esc = await legal_gate.escalate_run(ctx, run_id, "auto: refusal del agente")
            verification["escalated"] = ok_esc
            verification["refusal_detected"] = True
            log.info("S2 refusal en %s → escalado=%s", run_id, ok_esc)

    # ⑤ Shield salida: Llama Guard valida la respuesta del agente
    shield_out = await run_llama_guard(run.reply, output=True, original_user_text=req.text)
    if shield_out.verdict == "unsafe":
        log.warning("⛔ Llama Guard bloqueó el output: %s", shield_out.categories)
        return AgenticResponse(
            ok=False,
            reply="La respuesta generada fue retenida por la política de seguridad.",
            tools_used=run.tools_used,
            shield_in=_verdict_dict(shield_in),
            shield_out=_verdict_dict(shield_out),
            backend=run.backend,
            model=run.model,
            iterations=run.iterations,
            x402=run.x402_events,
            verification=verification,
        )

    log.info(
        "▶ respuesta (%d tools, %d iter, %s, x402: %s): %s",
        len(run.tools_used), run.iterations, run.backend,
        [e.get("status") for e in run.x402_events] or "—",
        run.reply[:120],
    )

    return AgenticResponse(
        ok=True,
        reply=run.reply,
        tools_used=run.tools_used,
        shield_in=_verdict_dict(shield_in),
        shield_out=_verdict_dict(shield_out),
        x402=run.x402_events,
        account={"id": ctx.account_id, "email": ctx.email} if ctx else {},
        backend=run.backend,
        model=run.model,
        iterations=run.iterations,
        verification=verification,
        artifacts=run.artifacts[:3],
    )


@app.get("/v1/health")
async def health() -> dict:
    """Salud del orquestador y conectividad con el ecosistema."""
    out: dict = {"ok": True, "service": "agent-brain", "version": app.version}

    # agent-os-api
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(f"{settings.agent_os_api_url}/health")
        out["api"] = {"ok": res.status_code == 200, "url": settings.agent_os_api_url}
    except Exception as e:  # noqa: BLE001
        out["api"] = {"ok": False, "error": str(e)[:120]}

    # Llama Stack
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            res = await client.get(
                f"{settings.llama_stack_url}/models",
                headers={"Authorization": f"Bearer {settings.llama_stack_api_key}"},
            )
        out["llama_stack"] = {"ok": res.status_code == 200, "url": settings.llama_stack_url}
    except Exception:  # noqa: BLE001
        out["llama_stack"] = {"ok": False, "url": settings.llama_stack_url}

    # Ollama (Llama Guard + fallback)
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            res = await client.get(f"{settings.ollama_url}/api/tags")
        models = [m.get("name") for m in res.json().get("models", [])] if res.status_code == 200 else []
        out["ollama"] = {"ok": res.status_code == 200, "models": models}
    except Exception:  # noqa: BLE001
        out["ollama"] = {"ok": False}

    out["guard"] = {
        "enabled": settings.guard_enabled,
        "model": settings.llama_guard_model,
        "excluded": settings.guard_excluded_categories,
    }
    return out


@app.get("/v1/tools")
async def list_tools() -> dict:
    """Herramientas disponibles para el LLM (metadata).

    Incluye las tools de las dapps INSTALADAS (tienda de apps): el
    refresh trae el catálogo del worker (TTL 60 s).
    """
    from . import mcp
    await mcp.refresh()
    return {
        "ok": True,
        "tools": [
            {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
            }
            for t in TOOLS.values()
        ],
    }
