"""Contexto de cuenta — identidad del orquestador (paso «Identidad» del diagrama).

El gateway agéntico recibe `Authorization: Bearer <session_token>` y
resuelve TODO el contexto de la cuenta contra la API (OpenID Provider):
  - llm:   proveedor + modelos + api_key de la cuenta
  - chain: red + wallet del orquestador + límites dPaaS
  - wallets: sub-wallets

Sin Bearer → None → la petición opera como "system" (config global de brain).
Token inválido → la API responde 401 y se propaga.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import httpx

from .config import settings

log = logging.getLogger("agent-brain.account")


@dataclass
class AccountContext:
    bearer: str
    account: dict
    llm: dict | None = None
    chain: dict | None = None
    wallets: list = field(default_factory=list)

    @property
    def account_id(self) -> str:
        return str(self.account.get("id", "system"))

    @property
    def email(self) -> str:
        return str(self.account.get("email", ""))

    @property
    def llm_base_url(self) -> str | None:
        return (self.llm or {}).get("base_url")

    @property
    def llm_api_key(self) -> str:
        return (self.llm or {}).get("api_key") or "fake"

    @property
    def llm_model(self) -> str | None:
        llm = self.llm or {}
        return llm.get("default_model") or (llm.get("models") or [None])[0]

    @property
    def llm_provider(self) -> str | None:
        return (self.llm or {}).get("provider")

    @property
    def network(self) -> str | None:
        return (self.chain or {}).get("network")

    @property
    def wallet(self) -> str | None:
        return (self.chain or {}).get("wallet_pubkey")


async def fetch_account_context(bearer: str) -> AccountContext | None:
    """Resuelve el contexto de la cuenta contra la API.

    Devuelve None si no hay token; propaga 401 si el token es inválido
    (el orquestador NO opera con una identidad rota).
    """
    if not bearer:
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{settings.agent_os_api_url}/accounts/me/context",
            headers={"Authorization": f"Bearer {bearer}"},
        )
    if res.status_code == 404:
        return None  # API sin módulo de cuentas (versión vieja) → system
    if res.status_code == 401:
        raise PermissionError("Bearer inválido o expirado (API: " + res.text[:120] + ")")
    res.raise_for_status()
    data = res.json()
    ctx = AccountContext(
        bearer=bearer,
        account=data.get("account") or {},
        llm=data.get("llm"),
        chain=data.get("chain"),
        wallets=data.get("wallets") or [],
    )
    log.info(
        "contexto de cuenta %s (%s): llm=%s model=%s red=%s wallet=%s",
        ctx.account_id, ctx.email, ctx.llm_provider, ctx.llm_model, ctx.network, ctx.wallet,
    )
    return ctx


def bearer_from_headers(headers) -> str:
    """Extrae `Authorization: Bearer <token>` de los headers de la request."""
    raw = headers.get("authorization") or headers.get("Authorization") or ""
    if raw.lower().startswith("bearer "):
        return raw[7:].strip()
    return ""
