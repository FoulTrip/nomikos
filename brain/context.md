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
│   ├── config.py    — settings del .env raíz (AGENT_OS_API_URL, GUARD_*,
│   │                  MUSE_BIN, MAX_TOOL_ITERATIONS)
│   ├── llm.py       — run_agent(): SOLO cliente de cuenta (account:<provider>);
│   │                  sin Bearer → 401, sin LLM activo → 400 LLM_NOT_CONFIGURED
│   ├── tools.py     — 11 tools → TODAS vía guarded_call(ctx); ToolResult; RunEvents
│   ├── x402.py      — guarded_call: 402 → delegated_pay_invoice (dPaaS de la cuenta)
│   │                  → poll (4×3 s) → reintento con X-Payment → 200 recurso
│   └── shields.py   — Llama Guard remoto vía endpoint OpenAI-compatible
│                      in/out; exclusiones S8/S9/S14
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
{device_id, text, solana_tx_signature?} + Authorization: Bearer (OBLIGATORIO)
  ① ctx = fetch_account_context(bearer)   → 401 si falta token o es inválido
  ② shield_in = run_llama_guard(text)     → 400-policy si unsafe
  ③ run = run_agent(text, ctx)            → SOLO LLM de la cuenta;
     sin proveedor activo → 400 LLM_NOT_CONFIGURED (sin fallback global:
     la cuenta trae sus keys en Modelos del agente)
  ④   por cada tool_call → execute_tool(ctx) → guarded_call → api
        (402 → pay-invoice delegado → reintento X-Payment → recurso)
  ⑤ shield_out = run_llama_guard(reply, output=True, original_user_text)
  → {ok, reply, tools_used, shield_in, shield_out, x402[], account, backend, model}
```

Cada respuesta de completion se inspecciona por `usage.prompt_tokens`,
`usage.completion_tokens` y `usage.total_tokens`. Brain envía esos contadores
a `POST /accounts/me/llm-usage` con el Bearer original; API clasifica el
registro a partir de la sesión (token de dispositivo = sandbox, cuenta en
mainnet = producción). No se estiman tokens cuando el proveedor no reporta
`usage`, y no se guardan prompts ni respuestas en el medidor.

Backend observable en `backend`: `account:<provider>` (LLM ACTIVO de la
cuenta, api_key de `account_llm_providers` desencriptada en `/me/context`).
Llama Guard se ejecuta con `GUARD_PROVIDER`, `GUARD_API_URL`, `GUARD_API_KEY`
y `GUARD_MODEL` desde el `.env` raíz; Ollama ya no forma parte del arranque.
Llama Stack fuera del arranque (`make up` ya no lo
levanta; `scripts/stack-up.sh` + `llm-health.sh` quedan para self-host).

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

## Shields (shields.py)

- Prompt Llama Guard (S1..S14); para output reconstruir
  `User: <original> / Agent: <reply>` como exige el formato oficial.
- Sanitizar markdown y truncar a 1500 chars antes de enviar el texto al proveedor.
- `GUARD_EXCLUDED_CATEGORIES=S8,S9,S14` calibra falsos positivos del dominio.
  S11 (self-harm) y demás siguen bloqueando.

## Variables de entorno (../.env, único archivo central)

`AGENT_OS_API_URL` (http://localhost:8080/api) · `GUARD_PROVIDER`,
`GUARD_API_URL`, `GUARD_API_KEY`, `GUARD_MODEL` ·
`GUARD_ENABLED/GUARD_EXCLUDED_CATEGORIES`
(default `S6,S7,S8,S9,S14`) · `MUSE_BIN`
(~/.local/bin/muse, tool local) · `MAX_TOOL_ITERATIONS=8`.
x402 sin config local: el gateway de `api` manda.

## Servicios de los que depende

| Puerto | Qué | Uso en brain |
|---|---|---|
| 8080 | api (Rust) | contexto de cuenta, tools, x402, dPaaS |
| proveedor configurado | `GUARD_API_URL` | Llama Guard hosted para shields in/out |

## Verificado end-to-end (no romper)

- Sin Bearer → 401 AUTH_REQUIRED (sin cuenta no hay LLM ni tools).
- Con Bearer de cuenta + LLM activo: `backend: account:nvidia-nim`, 1 tool call,
  handshake delegado settled → la ficha técnica REAL llega al reply.
- Token inválido → 401 antes de razonar. Input inseguro (S11) → bloqueado.

## Verificador legal S2 (workshop — gate, no verdad)

Brain CONSULTA al verificador de `api`, nunca ve `ground_truth/`.
Tools nuevas (vía `guarded_call`): `list_case_docs`, `read_case_doc`,
`legal_turn`, `submit_memorandum` (19 tools total). `brain/app/legal.py`:
`extract_run_id`, `ensure_verified_for_effect` (efectos `app_request`,
`place_call`, `x402_pay_toll` bloqueados sin pass), `poll_world_events`
(new_evidence mid-run como mensaje user), `escalate_run`, `has_refusal`.
`llm.py`: gate pre-ejecución + world poll por iteración. `main.py`:
post-check (efectos sin pass → `ok:false` + `verification{}`) y refusal
en contexto legal → auto-escalado. Respuesta añade `verification{run_id,
status, verdict, omissions, score}` (aditivo; sin contexto legal = `{}`).
No existe tool de checklist/verdict: el LLM no puede auto-verificarse.

Las tools MCP dinámicas y `app_request` reenvían `tool_name` junto a app,
método y ruta. El API registra ejecuciones exitosas junto a la factura,
`execution_environment`, red y `device_id`. El token de la placa simulada
identifica sandbox; el API determina el entorno desde la sesión y la red,
nunca desde una etiqueta confiada al browser.
