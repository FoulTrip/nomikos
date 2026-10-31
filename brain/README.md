# agent-brain — Capa Cognitiva del Agente OS

Orquestador agéntico en Python (**LLM por cuenta + Llama Guard configurable**) que implementa el cerebro Zero-UI del sistema:

```
ESP32 / agent-dapp ──(voz/texto)──► agent-brain (:8322)
                                        │
        ① Shield entrada ────────────── Llama Guard (proveedor del .env)
                                        │
        ② Razonamiento ─────────────── LLM activo de la cuenta
                                        ▼
        ③ Tools ────────────────────── agent-os-api (Rust :8080)
                                        │   ├── x402 Solana (micro-peajes, firma delegada)
                                        │   ├── Solana RPC (Devnet)
                                        │   └── Cloudflare R2 (modelo 3D)
                                        ▼
        ④ Shield salida ────────────── Llama Guard valida la respuesta
                                        │
                                        ▼
                                  respuesta al dispositivo
```

## Stack real verificado

| Capa | Implementación | Estado |
|---|---|---|
| Gateway | FastAPI `:8322` — `POST /v1/agentic-gateway` | ✅ probado end-to-end |
| Inference | LLM activo configurado por la cuenta (NIM, OpenAI o compatible) | ✅ real |
| OpenAI | provider registrado — se activa con `OPENAI_API_KEY` | 🔌 listo |
| Muse CLI | tool `ask_muse` (`muse exec` headless) — actualmente 402 billing Meta | ⚠️ requiere pago |
| Shields | Llama Guard en endpoint OpenAI-compatible definido en `.env` | ✅ entrada y salida; modelo configurable |
| x402 | Firma delegada: invoice → `POST /api/x402/pay` → verify → ejecutar | ✅ modo manual sin payer |

## Endpoints

| Endpoint | Función |
|---|---|
| `POST /v1/agentic-gateway` | Flujo completo: `{device_id, text, solana_tx_signature?}` → `{ok, reply, tools_used, shield_in, shield_out, x402, backend, model, iterations}` |
| `GET /v1/health` | Salud + conectividad con agent-os-api y configuración del guard NIM |
| `GET /v1/tools` | Las 11 herramientas del agente con sus schemas |

## Herramientas del agente (tools → agent-os-api)

**x402 (protocolo central):** `x402_summary` · `x402_create_invoice` · `x402_invoice_status` · `x402_pay_toll` · `x402_payouts`
**Solana:** `solana_status([network])` · `solana_urls`
**Dispositivo/R2:** `get_device` (x402) · `get_navbar_status` (x402) · `get_health`
**Muse:** `ask_muse(question)` — agente MSP local

`X402_PROTECTED_TOOLS` define qué tools exigen peaje (default: `get_device,get_navbar_status`). El usuario **nunca firma**: `x402.py` crea la factura y `agent-os-api` firma con `SOLANA_PAYER_KEYPAIR` (firma delegada). Sin payer configurado → modo manual con `pay_hint`.

## Setup

```bash
# 1. Define GUARD_PROVIDER, GUARD_API_URL, GUARD_API_KEY y GUARD_MODEL
#    en el .env central. Por defecto usa Llama Guard 4 de NVIDIA NIM.

# 2. agent-brain
source .venv/bin/activate
uvicorn app.main:app --port 8322
```

## Configuración clave (.env)

```env
GUARD_PROVIDER=nvidia-nim
GUARD_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
GUARD_API_KEY=${NVIDIA_API_KEY}
GUARD_MODEL=meta/llama-guard-4-12b
GUARD_EXCLUDED_CATEGORIES=S8,S9,S14       # calibración de falsos positivos del dominio
X402_AUTO_PAY=true
X402_PROTECTED_TOOLS=get_device,get_navbar_status
```

## Lecciones de implementación (documentadas)

1. **Falsos positivos del shield** en dominios técnicos → lista de exclusión por categoría para el dominio.
2. **Prompt de salida del guard** debe reconstruir el turno User/Agent completo.
3. Se truncan a 1500 caracteres y se sanitizan los textos antes de enviarlos al proveedor externo.
5. Modelos NIM EOL: `llama-3.1-8b` y `llama-3.3-70b` dieron 410 Gone → usar modelos vivos del catálogo (`muse-glimmer-30b` verificado con tool-calling).

## Pruebas ejecutadas

| Test | Resultado |
|---|---|
| Flujo normal ("cómo va Solana + resumen x402") | ✅ tools `solana_status`+`x402_summary`, shields safe, datos reales Devnet |
| Input inseguro (self-harm) | ✅ **bloqueado** por Llama Guard (S11) antes del LLM |
| Tool protegida x402 sin payer | ✅ factura creada, pago delegado 503, el agente informó el estado + pay_hint |
| Tool-calling del modelo | ✅ el modelo decide solo (mainnet como red, multi-iteración) |
