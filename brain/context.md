# context.md — brain/ (Python)

Capa cognitiva del Agente OS: **gateway agéntico** (FastAPI `:8322`) que
implementa el flujo del `diagram.d2` — identidad, shields, razonamiento con
tool-calls y handshake x402 reactivo. Orquesta; NO guarda estado de negocio
(la verdad vive en `api/`).

## Mapa del código

```
brain/
├── app/
│   ├── main.py      — POST /v1/agentic-gateway (flujo ①-⑤) · GET /v1/health · /v1/tools
│   ├── context.py   — AccountContext + fetch_account_context(bearer) + bearer_from_headers
│   ├── config.py    — settings de .env (AGENT_OS_API_URL, LLAMA_STACK_URL, LLM_MODEL,
│   │                  OLLAMA_URL, GUARD_*, MUSE_BIN, MAX_TOOL_ITERATIONS)
│   ├── llm.py       — run_agent(): cliente por cuenta (account:nvidia-nim) o global
│   │                  (llama-stack → ollama); loop de tool-calls multi-iteración
│   ├── tools.py     — 11 tools → TODAS vía guarded_call(ctx); ToolResult; RunEvents
│   ├── x402.py      — guarded_call: 402 → delegated_pay_invoice (dPaaS de la cuenta)
│   │                  → poll (4×3 s) → reintento con X-Payment → 200 recurso
│   └── shields.py   — Llama Guard 3 (Ollama :11434, llama-guard3:1b) in/out;
│                      exclusiones S8/S9/S14; retry ante respuesta vacía
├── run-stack.yaml   — distribución Llama Stack 0.7.3 (providers: nvidia-nim vía
│                      NVIDIA_API_KEY + openai opcional; responses builtin; sqlite-vec)
├── .venv            — runtime del brain (fastapi, httpx, openai)
├── .venv-stack      — servidor Llama Stack (llama-stack, openai, mcp==1.23.0,
│                      chardet, pypdf)
└── mcp-servers/     — (ver README) referencia al worker MCP real:
                       dapps/payload-cms/templates/with-cloudflare-d1/src/mcp/
```

## Flujo del gateway (`POST /v1/agentic-gateway`)

```
{device_id, text, solana_tx_signature?} + Authorization: Bearer?
  ① ctx = fetch_account_context(bearer)   → 401 si token inválido
  ② shield_in = run_llama_guard(text)     → 400-policy si unsafe
  ③ run = run_agent(text, ctx)            → LLM de la cuenta o global;
  ④   por cada tool_call → execute_tool(ctx) → guarded_call → api
        (402 → pay-invoice delegado → reintento X-Payment → recurso)
  ⑤ shield_out = run_llama_guard(reply, output=True, original_user_text)
  → {ok, reply, tools_used, shield_in, shield_out, x402[], account, backend, model}
```

Backends observables en `backend`: `account:<provider>` (LLM de la cuenta,
api_key de `account_llm` desencriptada en `/me/context`), `llama-stack`
(global vía NIM — **key viva desde 2026-10-26**, flip ejecutado:
`LLM_MODEL=nvidia/meta/muse-glimmer-30b` + stack arriba vía
`scripts/stack-up.sh`, que lee la key de `.env`; `scripts/llm-health.sh`
sondea ollama/stack/NIM en un comando),
`ollama` (fallback + backend global ACTUAL: `llama3.2:1b` local —
tool-calls verificados).

## Las 15 tools (tools.py)

Con F5 el agente opera la APP del ecosistema (Payload CMS) pagando un
peaje x402 POR PETICIÓN (app_request) y recibe turnos de VOZ del worker
(api /voice → aquí). La corrida es robusta a LLMs débiles: una tool mal
llamada devuelve un ToolResult de error y la conversación continúa.

`get_navbar_status` · `get_device` (protegida por peaje en api) ·
`get_health` · `solana_status([network])` · `solana_urls` · `x402_summary` ·
`x402_create_invoice(resource, amount_lamports)` · `x402_invoice_status(id)` ·
`x402_pay_toll(to, lamports, [memo])` · `x402_payouts` · `ask_muse(question)`
(CLI MSP local; hoy 402 billing de la cuenta Meta — se reporta como error).

## Handshake x402 del guard (x402.py) — pasos del diagrama

1. `_fetch(path, method, body, ctx)` con Bearer de la cuenta.
2. Si **402**: invoice del body → con cuenta: `delegated_pay_invoice`
   (`POST /api/accounts/me/x402/pay-invoice`) → firma el dPaaS con la wallet
   cifrada de la cuenta (valida límites) → `settled|verifying|failed`.
3. Reintento con `X-Payment: <invoice_id>` (SIEMPRE, incluso si pay-invoice
   devolvió settled — bug corregido: no hacer `break` sin reintentar).
   Poll 4 intentos × 3 s. 200 → recurso. 402-pending → seguir. 409 → replay.
4. Sin cuenta (system): modo **manual** → el resultado lleva el `pay_hint`
   para el usuario.
5. `X402Outcome` queda en `RunEvents` → `x402[]` de la respuesta.

## Shields (shields.py) — lecciones ya aprendidas

- Prompt oficial Llama Guard 3 (S1..S14); para output reconstruir
  `User: <original> / Agent: <reply>` o el 1B responde vacío.
- Sanitizar markdown (`*_#>` etc.) y truncar a 1500 chars antes del guard.
- Ollama options: `temperature 0, num_predict 40, num_ctx 1024` (Vulkan OOM
  con prompts ≥ ~400 tokens si num_ctx es alto).
- `GUARD_EXCLUDED_CATEGORIES=S8,S9,S14` (IP software / "peajes" / code abuse
  = falsos positivos del 1B en este dominio). S11 (self-harm) y demás siguen
  bloqueando (verificado).

## Variables de entorno (brain/.env)

`AGENT_OS_API_URL` (http://localhost:8080/api) · `LLAMA_STACK_URL`
(http://localhost:8321/v1) + `LLAMA_STACK_API_KEY=fake` · `LLM_MODEL`
(nvidia/meta/muse-glimmer-30b — el router exige prefijo de provider) ·
`OLLAMA_URL` · `GUARD_ENABLED/LLAMA_GUARD_MODEL/GUARD_VIA_LLAMA_STACK/
GUARD_EXCLUDED_CATEGORIES` · `MUSE_BIN` (~/.local/bin/muse) ·
`MAX_TOOL_ITERATIONS=8`. x402 sin config local: el gateway de `api` manda.

## Servicios de los que depende

| Puerto | Qué | Uso en brain |
|---|---|---|
| 8080 | api (Rust) | contexto de cuenta, tools, x402, dPaaS |
| 8321 | Llama Stack | inference global (NIM: muse-glimmer-30b — **key viva 2026-10-26**, arrancar con `scripts/stack-up.sh`; ollama queda de respaldo) |
| 11434 | Ollama | Llama Guard 3 (llama-guard3:1b) + fallback LLM (llama3.2:1b) |

## Verificado end-to-end (no romper)

- Sin Bearer: tools funcionan; `get_device` → 402 → manual con pay_hint.
- Con Bearer de cuenta: `backend: account:nvidia-nim`, 1 tool call,
  handshake delegado settled → la ficha técnica REAL llega al reply.
- Token inválido → 401 antes de razonar. Input inseguro (S11) → bloqueado.
