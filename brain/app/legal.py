"""legal.py — helpers S2 del workshop (gate de verificación + world polling).

El verificador vive en api (Rust); brain solo lo CONSULTA vía guarded_call.
Nunca ve ground_truth/, solo {status, verdict, omissions}.
"""

from __future__ import annotations

import logging
import re
import time

log = logging.getLogger("agent-brain.legal")

RUN_RE = re.compile(r"run-\d+-[0-9a-f]+")

# Tools con efectos externos (pagos, llamadas, app real): bloqueadas sin pass.
EFFECTFUL_TOOLS = frozenset({"app_request", "place_call", "x402_pay_toll"})

# Palabras que marcan contexto legal S1/S2 (sin run_id explícito).
LEGAL_KEYWORDS = ("dpaas", "toll", "peaje", "invoice", "factura", "memorandum", "memorándum", "exhibit", "dispute", "disputa", "ledger")

REFUSAL_PHRASES = (
    "insuficiente",
    "requiero",
    "no puedo concluir",
    "falta evidencia",
    "refusal",
)


def now_ms() -> int:
    return int(time.time() * 1000)


def extract_run_id(*texts: str) -> str | None:
    for t in texts:
        if not t:
            continue
        m = RUN_RE.search(t)
        if m:
            return m.group(0)
    return None


def is_legal_text(text: str) -> bool:
    low = (text or "").lower()
    return any(k in low for k in LEGAL_KEYWORDS) or RUN_RE.search(low) is not None


async def fetch_run(ctx, run_id: str) -> dict | None:
    """GET /legal/runs/{id} vía guard. None si no se puede leer."""
    from .x402 import guarded_call

    g = await guarded_call(f"/legal/runs/{run_id}", ctx=ctx)
    if g.status_code == 200 and isinstance(g.data, dict):
        return g.data
    log.info("legal fetch_run %s → HTTP %s", run_id, g.status_code)
    return None


def run_passed(run_data: dict | None) -> tuple[bool, list, str, float]:
    """(passed, omissions, status, score) desde el detalle del run."""
    if not run_data:
        return False, [], "unknown", 0.0
    run = run_data.get("run", {}) or {}
    status = str(run.get("status", "unknown"))
    verdicts = run_data.get("verdicts", []) or []
    last = verdicts[-1] if verdicts else {}
    verdict = str(last.get("verdict", ""))
    omissions = last.get("omissions", []) or []
    try:
        score = float(last.get("score", 0.0))
    except (TypeError, ValueError):
        score = 0.0
    passed = verdict == "pass" and status in ("verified", "signed")
    return passed, omissions, status, score


async def ensure_verified_for_effect(ctx, run_id: str | None) -> tuple[bool, str, list]:
    """Gate pre-ejecución: (ok, detail, omissions).

    - Sin run_id en contexto legal → bloquea (hay que crear el run primero).
    - Con run_id → exige verdict=pass + status verified|signed.
    """
    if not run_id:
        return False, "contexto legal sin run_id: crea un run (POST /legal/runs) y entrega el memorándum antes de efectos", []
    data = await fetch_run(ctx, run_id)
    passed, omissions, status, score = run_passed(data)
    if passed:
        return True, f"run {run_id} verificado ({status}, score {score})", []
    omit_ids = [o.get("id", "?") for o in omissions] if isinstance(omissions, list) else []
    return False, f"run {run_id} no verificado (status={status}, omisiones={omit_ids})", omissions


async def poll_world_events(ctx, run_id: str, since_ms: int) -> list[dict]:
    """GET /legal/runs/{id}/events?since= → solo new_evidence."""
    from .x402 import guarded_call

    g = await guarded_call(f"/legal/runs/{run_id}/events?since={since_ms}", ctx=ctx)
    if g.status_code != 200 or not isinstance(g.data, dict):
        return []
    events = g.data.get("events", []) or []
    return [e for e in events if e.get("kind") == "new_evidence"]


async def escalate_run(ctx, run_id: str, reason: str) -> bool:
    """POST /legal/runs/{id}/escalate. True si el api lo aceptó."""
    from .x402 import guarded_call

    g = await guarded_call(f"/legal/runs/{run_id}/escalate", method="POST",
                           body={"reason": reason}, ctx=ctx)
    return g.status_code == 200


def has_refusal(text: str) -> bool:
    low = (text or "").lower()
    return any(p in low for p in REFUSAL_PHRASES)
