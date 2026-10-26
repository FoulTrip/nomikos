# AGENTS.md — Monorepo Hackaton (raíz)

Este archivo es el punto de entrada para agentes de código (opencode, Muse,
Claude Code, Cursor, etc.). **Antes de tocar código de un proyecto, lee su
`AGENTS.md` y su `context.md`:**

| Proyecto | Leer SIEMPRE | Stack |
|---|---|---|
| `api/` | [`api/AGENTS.md`](api/AGENTS.md) + [`api/context.md`](api/context.md) | Rust (axum 0.8, rusqlite) |
| `brain/` | [`brain/AGENTS.md`](brain/AGENTS.md) + [`brain/context.md`](brain/context.md) | Python (FastAPI, Llama Stack) |
| `dapp/` | [`dapp/AGENTS.md`](dapp/AGENTS.md) + [`dapp/context.md`](dapp/context.md) | TypeScript (Next.js 16) |
| `firmware/` | [`firmware/context.md`](firmware/context.md) | Rust (agentd-core no_std + simulador host + scaffold esp32) |
| `os/` | [`os/context.md`](os/context.md) | Buildroot (BR2_EXTERNAL + agente systemd, nivel SBC) |
| `dapps/payload-cms/` | [`dapps/payload-cms/AGENTS.md`](dapps/payload-cms/AGENTS.md) | Payload CMS 3 (monorepo upstream) |

# El front door del workspace es el `Makefile` de la raíz: `make up`
# prende el ecosistema desde el `.env` central (ver README.md).

## Reglas del workspace

1. **La ruta del workspace termina en ESPACIO**: `/home/foultrip/Documentos/Hackaton `.
   Cítala SIEMPRE con comillas (`"…/Hackaton "`). Los paths sin comillas fallan.
2. **Nombres renombrados** — usa estos, nunca los antiguos:
   - `api/` (antes `agent-os-api`) — API Rust, fuente única de verdad
   - `brain/` (antes `agent-brain`) — capa cognitiva / gateway agéntico
   - `dapp/` (antes `agent-dapp`) — frontend Next.js (simulador Zero-UI)
   - `dapps/payload-cms/` (antes `payload-cloudflare/`) — clon del monorepo de Payload
3. **El venv de `brain/` se rompe al mover la carpeta** (paths absolutos en
   shebangs). Si `uvicorn` falla con `python3: not found`, recrear:
   `rm -rf brain/.venv && python3 -m venv brain/.venv && brain/.venv/bin/pip install -r brain/requirements.txt`
   (igual para `brain/.venv-stack` con `llama-stack openai "mcp==1.23.0" chardet pypdf`).
4. **Arquitectura de verdad única**: `brain` y `dapp` NO guardan estado propio
   de negocio; TODO pasa por `api` (Bearer → contexto de cuenta). Las URLs RPC
   de Solana, credenciales LLM y wallets viven en `api` — no duplicarlas.
5. **Migraciones SQLite idempotentes** en `api/src/db.rs`: usar
   `Self::add_column_if_missing(...)`; nunca `ALTER TABLE` sueltos.
6. **x402 es reactivo**: los recursos protegidos responden `402 + invoice`
   (`X402_PROTECTED_PATHS` en `api/.env`, matching exacto). El pago delegado
   (dPaaS) lo firma la wallet cifrada de la cuenta — el usuario nunca firma.
7. **Secretos**: `api` cifra api_keys y keypairs con `ACCOUNTS_MASTER_KEY`
   (XChaCha20-Poly1305). Nunca loguear keypairs ni api_keys.
8. **El peaje es one-shot**: facturas `settled` se consumen con `consumed_at`;
   replay → `409`. Mantener esa semántica en cualquier cambio.

## Puertos y servicios

| Puerto | Servicio | Cómo arrancar |
|---|---|---|
| 8080 | `api` (Rust) | `cd api && cargo run` |
| 8321 | Llama Stack (NVIDIA NIM) | `cd brain && ./scripts/stack-up.sh &` (key NIM en `brain/.env`) |
| 8322 | `brain` (FastAPI) | `cd brain && .venv/bin/python -m uvicorn app.main:app --port 8322` |
| 11434 | Ollama (Llama Guard 3) | `~/.local/bin/ollama serve` |
| 3123 | `dapp` (Next.js) | `cd dapp && npm run dev` |

## Prueba de humo rápida (todo el flujo)

```bash
# gateway agéntico sin cuenta (system):
curl -s -X POST http://localhost:8322/v1/agentic-gateway \
  -H "Content-Type: application/json" -d '{"text":"estado de salud de la API"}'
# con cuenta (register → login → Bearer):
curl -s -X POST http://localhost:8080/api/auth/register -H "Content-Type: application/json" \
  -d '{"email":"demo@tripkode.dev","password":"demo-segura-123"}'
```
