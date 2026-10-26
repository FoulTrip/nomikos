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
   - LLM: por cuenta si `ctx.llm` existe (`backend: "account:<provider>"`),
     si no Llama Stack (`:8321/v1`) con fallback Ollama (`:11434/v1`).
   - x402: **TODAS** las llamadas a `api` pasan por `x402.guarded_call()`
     (handshake reactivo: 402 → `pay-invoice` delegado → poll → reintento
     con `X-Payment`). NO reintroducir el flujo proactivo viejo.
3. **Shields Llama Guard 3** (`shields.py`): prompt OFICIAL con conversación
   completa `User:/Agent:` (output=True requiere el texto original del
   usuario — sin eso el 1B responde vacío). Sanitizar markdown antes
   (`_sanitize_for_guard`), truncar a 1500 chars, `num_ctx: 1024` (sin eso,
   Ollama+Vulkan da ErrorOutOfDeviceMemory). Exclusiones de categorías por
   `GUARD_EXCLUDED_CATEGORIES` (falsos positivos del 1B, práctica Red Hat).
   Fail-open documentado (en producción, fail-closed).
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
- No cambiar `OLLAMA`/`num_ctx` del guard sin probar el caso de texto
  largo (markdown) — es la causa conocida de respuestas vacías del 1B.

## Prueba de humo

```bash
curl -s -X POST http://localhost:8322/v1/agentic-gateway \
  -H "Content-Type: application/json" -d '{"text":"estado de salud de la API"}'
# con cuenta: -H "Authorization: Bearer <token de login de :8080/api/auth/login>"
```
