"""x402 — Handshake reactivo (Fase 5): 402 → pago delegado → reintento firmado.

Implementa los pasos 1-7 del diagrama en el lado del orquestador:
  1. HTTP Request normal al recurso (MCP Gateway)
  2. El gateway responde 402 + invoice
  3. «Pide firma»: dPaaS de la CUENTA paga (POST /me/x402/pay-invoice)
  4. X-Payment: reintento con header X-Payment (one-shot en la API)
  5. Tool call ejecutada con el peaje liquidado

Sin cuenta autenticada (system) el guard devuelve modo manual (pay_hint).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

import httpx

from .config import settings
from .context import AccountContext

log = logging.getLogger("agent-brain.x402")

VERIFY_POLLS = 4  # reintentos del acceso mientras la tx confirma on-chain
POLL_SECS = 3


@dataclass
class X402Outcome:
    """Resultado del handshake para una tool (expuesto en la respuesta)."""

    status: str = "skipped"  # skipped | settled | verifying | manual | failed | replay
    invoice_id: str | None = None
    tx_signature: str | None = None
    detail: str = ""
    resource: str = ""

    def as_dict(self) -> dict:
        return {
            "status": self.status,
            "invoice_id": self.invoice_id,
            "tx_signature": self.tx_signature,
            "resource": self.resource,
            "detail": self.detail,
        }


@dataclass
class GuardedResult:
    status_code: int
    data: dict | str | None = None
    x402: X402Outcome = field(default_factory=X402Outcome)


def _headers(ctx: AccountContext | None, x_payment: str | None = None) -> dict:
    h = {"Content-Type": "application/json"}
    if ctx:
        h["Authorization"] = f"Bearer {ctx.bearer}"
    if x_payment:
        h["X-Payment"] = x_payment
    return h


async def _fetch(path: str, method: str, body: dict | None, ctx: AccountContext | None, x_payment: str | None):
    async with httpx.AsyncClient(timeout=45) as client:
        res = await client.request(
            method,
            f"{settings.agent_os_api_url}{path}",
            json=body,
            headers=_headers(ctx, x_payment),
        )
    try:
        data = res.json()
    except Exception:  # noqa: BLE001
        data = res.text[:500]
    return res.status_code, data


async def delegated_pay_invoice(invoice_id: str, ctx: AccountContext) -> tuple[dict | None, X402Outcome]:
    """«3. Pide firma» — el dPaaS de la cuenta paga la factura con SU wallet."""
    code, data = await _fetch(
        "/accounts/me/x402/pay-invoice",
        "POST",
        {"invoice_id": invoice_id},
        ctx,
        None,
    )
    if code != 200:
        return None, X402Outcome(
            status="failed",
            invoice_id=invoice_id,
            detail=f"pay-invoice HTTP {code}: {str(data)[:200]}",
        )
    invoice = data.get("invoice", data)
    out = X402Outcome(
        status=invoice.get("status", "verifying"),
        invoice_id=invoice.get("id", invoice_id),
        tx_signature=invoice.get("tx_signature"),
    )
    if out.status == "settled":
        out.detail = "micro-peaje liquidado on-chain"
    else:
        out.detail = f"pago delegado enviado ({out.status}), tx {out.tx_signature or '—'}"
    return invoice, out


async def guarded_call(
    path: str,
    *,
    method: str = "GET",
    body: dict | None = None,
    ctx: AccountContext | None = None,
) -> GuardedResult:
    """Llama un recurso de la API ejecutando el handshake x402 si responde 402.

    - 402 + cuenta autenticada → pago delegado (dPaaS) → reintento con X-Payment
    - 402 sin cuenta → modo manual: devuelve el pay_hint para el usuario
    - X-Payment verificando → poll corto hasta settled o agotar intentos
    """
    outcome = X402Outcome()

    code, data = await _fetch(path, method, body, ctx, None)

    if code != 402:
        return GuardedResult(code, data, outcome)

    # ── Handshake: la API exige micro-peaje ──
    invoice = (data or {}).get("invoice") or {}
    outcome.invoice_id = invoice.get("id")
    outcome.resource = invoice.get("resource", "")
    log.info("402 en %s → invoice %s (recurso %s)", path, outcome.invoice_id, outcome.resource)

    if not ctx:
        outcome.status = "manual"
        outcome.detail = "sin cuenta autenticada: pago manual requerido — " + str(
            invoice.get("pay_hint", "")
        )[:300]
        return GuardedResult(code, data, outcome)

    # 3-4) Firma delegada de la CUENTA.
    inv, outcome = await delegated_pay_invoice(outcome.invoice_id, ctx)
    if outcome.status == "failed":
        return GuardedResult(402, data, outcome)

    # 5) Reintento con X-Payment (poll mientras confirma on-chain).
    #    Siempre reintentamos: aunque pay-invoice ya haya devuelto settled,
    #    el acceso al recurso solo se concede con el reintento firmado.
    for attempt in range(1, VERIFY_POLLS + 1):
        if attempt > 1:
            await asyncio.sleep(POLL_SECS)
        code2, data2 = await _fetch(path, method, body, ctx, outcome.invoice_id)
        if code2 == 200:
            outcome.status = "settled"
            outcome.detail = "micro-peaje liquidado on-chain — acceso concedido"
            return GuardedResult(200, data2, outcome)
        if code2 == 402:
            # sigue sin confirmar: actualizar estado desde la invoice devuelta
            inv2 = (data2 or {}).get("invoice") or {}
            if inv2.get("status") == "failed":
                outcome.status = "failed"
                outcome.detail = "la tx delegada fue rechazada on-chain"
                return GuardedResult(402, data2, outcome)
            continue
        if code2 == 409:
            outcome.status = "replay"
            outcome.detail = "X-Payment ya consumido (replay)"
            return GuardedResult(409, data2, outcome)
        # otro error → propagar
        return GuardedResult(code2, data2, outcome)

    if outcome.status != "settled":
        outcome.status = "verifying"
        outcome.detail = (
            f"pago delegado enviado (tx {outcome.tx_signature or '—'}); "
            "confirmación on-chain en curso — reintenta en segundos"
        )
    return GuardedResult(402, data, outcome)
