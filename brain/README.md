# agent-brain — Capa Cognitiva del Agente OS

Orquestador agéntico en Python (**Llama Stack + Llama Guard**) que implementa el cerebro Zero-UI del sistema:

```
ESP32 / agent-dapp ──(voz/texto)──► agent-brain (:8322)
                                        │
        ① Shield entrada ────────────── Llama Guard 3 (Ollama local, CPU)
                                        │
        ② Razonamiento ─────────────── Llama Stack (:8321) → NVIDIA NIM
                                        │   modelo: meta/muse-glimmer-30b
                                        │   (Muse de Meta vía NIM, reasoning + tool-calls)
                                        ▼
        ③ Tools ────────────────────── agent-os-api (Rust :8080)
                                        │   ├── x402 Solana (micro-peajes, firma delegada)
                                        │   ├── Solana RPC (Devnet)
                                        │   └── Cloudflare R2 (modelo 3D)
                                        ▼
        ④ Shield salida ────────────── Llama Guard 3 valida la respuesta
                                        │
                                        ▼
                                  respuesta al dispositivo
```

## Stack real verificado

| Capa | Implementación | Estado |
|---|---|---|
| Gateway | FastAPI `:8322` — `POST /v1/agentic-gateway` | ✅ probado end-to-end |
| Inference | **Llama Stack 0.7.3** (`:8321`) → provider `remote::nvidia` (NIM) | ✅ real |
| Modelo | `nvidia/meta/muse-glimmer-30b` — Muse de Meta vía NIM (tool-calling) | ✅ probado |
| OpenAI | provider registrado — se activa con `OPENAI_API_KEY` | 🔌 listo |
| Muse CLI | tool `ask_muse` (`muse exec` headless) — actualmente 402 billing Meta | ⚠️ requiere pago |
| Shields | **Llama Guard 3** `llama-guard3:1b` en Ollama local (CPU) | ✅ bloquea S11 real; exclusiones S8/S9/S14 |
| x402 | Firma delegada: invoice → `POST /api/x402/pay` → verify → ejecutar | ✅ modo manual sin payer |

## Endpoints

| Endpoint | Función |
|---|---|
| `POST /v1/agentic-gateway` | Flujo completo: `{device_id, text, solana_tx_signature?}` → `{ok, reply, tools_used, shield_in, shield_out, x402, backend, model, iterations}` |
| `GET /v1/health` | Salud + conectividad (agent-os-api, Llama Stack, Ollama) |
| `GET /v1/tools` | Las 11 herramientas del agente con sus schemas |

## Herramientas del agente (tools → agent-os-api)

**x402 (protocolo central):** `x402_summary` · `x402_create_invoice` · `x402_invoice_status` · `x402_pay_toll` · `x402_payouts`
**Solana:** `solana_status([network])` · `solana_urls`
**Dispositivo/R2:** `get_device` (x402) · `get_navbar_status` (x402) · `get_health`
**Muse:** `ask_muse(question)` — agente MSP local

`X402_PROTECTED_TOOLS` define qué tools exigen peaje (default: `get_device,get_navbar_status`). El usuario **nunca firma**: `x402.py` crea la factura y `agent-os-api` firma con `SOLANA_PAYER_KEYPAIR` (firma delegada). Sin payer configurado → modo manual con `pay_hint`.

## Setup

```bash
# 1. Ollama (Llama Guard en CPU) + modelos
~/.local/bin/ollama serve &
~/.local/bin/ollama pull llama-guard3:1b   # shield (1.6 GB)
~/.local/bin/ollama pull llama3.2:1b      # fallback inference (opcional)

# 2. Llama Stack (providers: NVIDIA NIM + OpenAI)
cd agent-brain
NVIDIA_API_KEY=nvapi-... .venv-stack/bin/llama stack run run-stack.yaml

# 3. agent-brain
source .venv/bin/activate
uvicorn app.main:app --port 8322
```

## Configuración clave (.env)

```env
LLAMA_STACK_URL=http://localhost:8321/v1
LLM_MODEL=nvidia/meta/muse-glimmer-30b   # router exige prefijo provider
GUARD_EXCLUDED_CATEGORIES=S8,S9,S14       # calibración anti falsos positivos (práctica Red Hat)
X402_AUTO_PAY=true
X402_PROTECTED_TOOLS=get_device,get_navbar_status
```

## Lecciones de implementación (documentadas)

1. **Falsos positivos del Llama Guard 1B** en dominios técnicos (S8 por nombres de software, S9 por "peajes") → exclusion list por categoría, como recomienda Red Hat para workflows legítimos.
2. **Prompt de salida del guard** debe reconstruir la conversación `User: … / Agent: …` (si solo va `User:`, el 1B emite vacío).
3. **Ollama + Vulkan OOM** con prompts ≥ ~400 tokens → `num_ctx: 1024` en las options del shield.
4. **markdown en el output** atasca al 1B → sanitización ligera antes del shield.
5. Modelos NIM EOL: `llama-3.1-8b` y `llama-3.3-70b` dieron 410 Gone → usar modelos vivos del catálogo (`muse-glimmer-30b` verificado con tool-calling).

## Pruebas ejecutadas

| Test | Resultado |
|---|---|
| Flujo normal ("cómo va Solana + resumen x402") | ✅ tools `solana_status`+`x402_summary`, shields safe, datos reales Devnet |
| Input inseguro (self-harm) | ✅ **bloqueado** por Llama Guard (S11) antes del LLM |
| Tool protegida x402 sin payer | ✅ factura creada, pago delegado 503, el agente informó el estado + pay_hint |
| Tool-calling del modelo | ✅ el modelo decide solo (mainnet como red, multi-iteración) |
