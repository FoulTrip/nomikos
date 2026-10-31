# AGENTS.md — brain/ (Python)

Reglas de agente para la capa cognitiva (gateway agéntico). Complemento
imprescindible: [`context.md`](context.md).

## Reglas duras

1. **Python 3.13 + venv propio** (`.venv` para brain, `.venv-stack` para el
   servidor Llama Stack). Los venv se rompen al mover la carpeta → recrear
   (ver AGENTS.md de la raíz). Ejecutar SIEMPRE con `.venv/bin/python -m uvicorn …`.
2. **Arquitectura** (no romper):
   - TODO el estado de negocio vive en `api` — brain solo orquesta.
   - Identidad: `context.fetch_account_context(bearer)` → `AccountContext`
     (llm/chain/wallets). Token inválido → `PermissionError` → **401** (no
     se opera con identidad rota).
   - LLM: SOLO el de la cuenta (`backend: "account:<provider>"`, key +
     modelos del contexto). Sin proveedor activo → `LLMNotConfigured` →
     **400 `LLM_NOT_CONFIGURED`**. NO hay fallback global.
   - x402: **TODAS** las llamadas a `api` pasan por `x402.guarded_call()`
     (handshake reactivo: 402 → `pay-invoice` delegado → poll → reintento
     con `X-Payment`). NO reintroducir el flujo proactivo viejo.
3. **Shields Llama Guard** (`shields.py`): proveedor, URL OpenAI-compatible,
   clave y modelo salen de `GUARD_PROVIDER`, `GUARD_API_URL`, `GUARD_API_KEY`
   y `GUARD_MODEL` del `.env` raíz. Para salida, reconstruir la conversación
   completa `User:/Agent:`. Sanitizar y truncar ambos textos a 1500 caracteres
   antes de enviarlos al proveedor. Nunca loguear la clave ni el contenido.
   Aplicar `GUARD_EXCLUDED_CATEGORIES` al resultado. Fail-open documentado
   (en producción, fail-closed). Ollama ya no se usa ni se inicia.
4. **Loop de tools** (`llm.py::run_agent`): máx `MAX_TOOL_ITERATIONS` (8).
   Los tool messages van serializados con `ToolResult.as_tool_message()`
   (incluye `x402` outcome si hubo handshake). Nunca inventar datos: si una
   tool falla, el error se pasa tal cual al LLM.
5. **Respuesta del gateway**: SIEMPRE incluir `account`, `backend`, `model`,
   `tools_used`, `shield_in/out` y `x402[]` events — son el contrato del
   contrato del flujo del diagrama.
6. **`docs.json` del MCP worker NO va aquí**: el worker MCP vive en
   `dapps/payload-cms/templates/with-cloudflare-d1/src/mcp/` (workers-mcp).
   Brain no es un servidor MCP stdio.
7. **Sin pancies de estado global**: settings solo de `.env` (config.py);
   nada de credenciales LLM en brain cuando hay cuenta — vienen del contexto.

## Qué NO hacer

- No llamar a `api` con `httpx` directo saltándose `guarded_call` (perderías
  el handshake x402).
- No loguear api_keys ni tokens de sesión (el contexto trae el api_key del
  proveedor de la cuenta: solo se usa en el cliente OpenAI).
- No cachear `AccountContext` entre requests: se resuelve por petición.

- No loguear ni exponer GUARD_API_KEY o el contenido moderado.

## Prueba de humo

```bash
# Bearer OBLIGATORIO (sin cuenta no hay LLM: 401 AUTH_REQUIRED)
TOK=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"…","password":"…"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
curl -s -X POST http://localhost:8322/v1/agentic-gateway \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"text":"estado de salud de la API"}'
```
