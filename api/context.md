# context.md — api/ (Rust)

API del Agente OS: **fuente única de verdad** (axum 0.8 + SQLite + tokio).
Puerto `:8080`. Binario `agent-os-api` (el nombre de paquete NO cambia aunque
la carpeta sea `api/`).

## Mapa del código

```
api/src/
├── main.rs          — bootstrap: config, DB, spawns (sync_loop, settler), servidor
├── config.rs        — Config::load() lee el .env raíz (dotenv a mano); ObjectStoreConfig; master key
├── api.rs           — router (TODAS las rutas) + handlers generales + middleware gate
├── db.rs            — SQLite (WAL): schema + migraciones idempotentes + helpers
├── crypto.rs        — argon2id + XChaCha20-Poly1305 (seal/open) + tokens de sesión
├── state.rs         — SharedState = Arc<AppState{cfg, db, http, object_store, mcp, started_at}>
├── error.rs         — AppError → JSON {"ok":false,"error":…}
├── b58.rs / r2.rs   — base58 a mano / cliente S3 SigV4 (RustFS local y R2)
└── modules/
    ├── accounts.rs  — IdP (register/login/logout/me), config por cuenta,
    │                  keypair import (cifra + deriva pubkey), sub-wallets,
    │                  resolve_account_id (identidad opcional), /me/context
    ├── x402.rs      — facturas, verify on-chain, payouts, settler_loop,
    │                  middleware x402_gate (402 reactivo), settle_access
    │                  (one-shot), dPaaS (resolve_payer, check_limits,
    │                  pay_invoice delegado, handlers /me/x402/*)
    ├── apps.rs     — catálogo global de DApps en SQLite, búsqueda por
    │                  slug/nombre/descripción e instalación
    ├── solana.rs    — SolanaClient (JSON-RPC), wallets CLI, transferencia
    │                  firmada (ed25519, transfer_lamports_with_kp)
    ├── device.rs    — ficha técnica + modelo 3D desde el object store seleccionado (sin fallback)
    └── erp.rs       — salud del ERP (Payload CMS: {PAYLOAD_URL}/api/users)
```

## Modelo de datos (SQLite, `api/data/agent-os.db`)

| Tabla | Contenido |
|---|---|
| `accounts` | email único, `password_hash` (argon2id PHC), display_name, is_active |
| `account_llm_providers` | N proveedores por cuenta (PK account+provider): base_url, api_key_enc (AEAD), models JSON, default_model, is_active (uno solo) |
| `account_chain` | red ACTIVA + espejo dPaaS (network, wallet_pubkey, payer_keypair_enc (AEAD), payee, daily/tx_limit, **active_wallet_label** (wallet operativa: label de sub-wallet o NULL = principal dPaaS)) |
| `account_chain_wallets` | **bóveda dPaaS: UNA wallet auto-generada por (cuenta, red)** — devnet+mainnet al registrar, las demás al cambiar de red; el panel solo las muestra para fondear |
| `system_wallets` | Firmantes globales por red/rol; puede quedar una treasury Devnet cifrada de versiones anteriores, ya no participa en el faucet |
| `devnet_faucet_claims` | Última solicitud de faucet Devnet por cuenta; cooldown persistente de 60 s |
| `account_wallets` | sub-wallets por cuenta: label, network, pubkey, keypair_enc, daily_limit |
| `account_connected_wallets` | **wallets del navegador (Phantom/MetaMask/…)**: label, provider, chain (solana\|evm), **solo pubkey** (la clave privada nunca sale de la wallet), is_active (una por cuenta), UNIQUE(account_id, label) |
| `account_services` | **dapps que el agente usará con x402**: service, display_name, via_x402=1, resource del peaje (`x402:path:…`), snapshot payer_pubkey/network, status, UNIQUE(account_id, service) |
| `devices` | **NomikOS Fase 1 — flota**: pubkey ed25519 de la placa, board, claim_code (15 min, NULL tras claim), enroll_secret_hash (sha256), status/last_seen_at, límites dPaaS por dispositivo, account_id (NULL hasta el claim) |
| `sessions` | `token_hash` (sha256 del token opaco), account_id, expires_at · **columna `device_id`**: un token de DISPOSITIVO es una sesión ligada a un device (TTL 30 días) |
| `login_attempts` | email, at, ok (anti-bruteforce 5/min) |
| `x402_invoices` | id, resource, amount, payee, status(pending/verifying/settled/failed), tx_signature, **account_id**, **consumed_at** (one-shot) |
| `x402_payouts` | pagos salientes con **execution_environment + network** capturados al encolarse; el settlement usa el wallet de esa red |
| `app_tool_calls` | ejecución de tools instaladas (app/tool, método/ruta, factura, **entorno + red + dispositivo**); backfill desde facturas x402 consumidas |
| `llm_usage_events` | tokens prompt/completion que el proveedor reporta por llamada, **proveedor/modelo + entorno + red + dispositivo**; no guarda prompts ni respuestas |
| `x402_payouts` | id, to, amount, status(queued/sent/confirmed/failed), **account_id**, attempts, error |
| `service_status` / `device` / `device_specs` | navbar (ERP/Solana), ficha técnica |

## Flujo x402 (handshake del `diagram.d2`)

1. `x402_gate` (middleware sobre TODO el router; solo actúa en
   `X402_PROTECTED_PATHS`, matching exacto): sin `X-Payment` →
   `payment_required_response()` = **402 + invoice de la cuenta** +
   `WWW-Authenticate: X402` + `X-Payment-Invoice-Id`.
2. Con `X-Payment: <id>` → `settle_access(state, id, account)`:
   404 inexistente · 403 de otra cuenta · 409 consumida (replay) ·
   402 pending/verifying · **Ok(()) = consume one-shot y el middleware ejecuta
   el recurso real** (`next.run(req)`).
3. dPaaS: `POST /api/accounts/me/x402/pay-invoice` → `pay_invoice_value()`:
   ownership + `check_limits` → `resolve_payer` (descifra keypair de la cuenta)
   → `transfer_lamports_with_kp` (SU red) → registra tx → poll corto de
   `attempt_verify`; el `settler_loop` (15 s) confirma en background.
4. Payouts encolados: `advance_payouts` firma por CUENTA con SU keypair y SU red;
   `system` usa `SOLANA_PAYER_KEYPAIR` global.

## Roles de las wallets Solana

- La wallet dPaaS de cada cuenta firma sus propios peajes y pagos delegados.
- `X402_PAYEE_WALLET` es la dirección global que recibe los peajes x402; no firma.
- `SOLANA_PAYER_KEYPAIR` es un firmante global opcional para payouts `system`.
- El faucet solicita SOL Devnet directamente para la wallet Devnet de la cuenta mediante `requestAirdrop`; la treasury legacy no interviene. El RPC público conserva sus propios límites.
- `SOLANA_WALLET` solo elige una dirección de observación para el estado global; si falta, se observa `X402_PAYEE_WALLET` y luego la wallet del CLI.

## Endpoints (`:8080/api`)

| Grupo | Rutas |
|---|---|
| Auth | `POST /auth/register` (201/409/400) · `POST /auth/login` (token Bearer; 401; 429 tras 5 fallos) · `POST /auth/logout` · `GET /auth/me` |
| Cuenta | `PUT /accounts/me/llm` (upsert UN proveedor: api_key AEAD, base_url, models, default_model; el primero auto-activa) · `POST /accounts/me/llm/active {provider?, model?}` (elige el ÚNICO activo) · `DELETE /accounts/me/llm?provider=X` (borra ese; sin activo el agente exige configurar — sin fallback global) · `GET/POST /devices/me/llm[/active]` (el device SOLO lista/elige de su cuenta, sin secretos) · `PUT /accounts/me/chain` (network + **active_wallet_label** tri-state: label/null/ausente; cambiar de red auto-crea SU dPaaS) · `POST /accounts/me/chain/keypair/import` (ROTA la wallet de la red activa; acepta array o string) · `POST /accounts/me/chain/keypair/generate` (relleno si falta; 409 si existe — el registro ya genera devnet+mainnet solas) · `GET /accounts/me/context` (resolución completa para brain, incluye active_wallet_pubkey + `chain.wallets[]` por red para fondear) · `GET/POST /accounts/me/wallets` · `GET/POST /accounts/me/connected-wallets` (Phantom/MetaMask/… — solo pubkeys; conectar la marca como en uso, `PUT …/connected-wallets/activate {label}` cambia cuál) · `GET/POST /accounts/me/services` (catálogo de dapps x402 + alta que persiste cuenta→servicio→x402 con snapshot dPaaS; 201/409/400) |
| dPaaS y métricas | `GET /accounts/me/x402/summary[?environment=production|sandbox]` · `GET /accounts/me/x402/invoices[?environment=production|sandbox]` · `GET /accounts/me/tool-usage[?environment=production|sandbox]` · `GET /accounts/me/llm-usage[?environment=production|sandbox&days=7|14|30|90]` · Brain registra contadores reales en `POST /accounts/me/llm-usage`; el API asigna entorno desde el Bearer · `POST /accounts/me/x402/pay` · `POST /accounts/me/x402/pay-invoice` |
| Flota (NomikOS) | `POST /devices/enroll` (placa sin auth → claim_code 15 min + enroll_secret) · `POST /devices/claim {code}` (Bearer cuenta, atómico) · `POST /devices/token` (la placa sondea con enroll_secret → Bearer de dispositivo, 202 antes del claim) · `GET /devices/me` + `POST /devices/me/heartbeat` (token de dispositivo) · `GET /devices` (flota de la cuenta) · `PUT /devices/{id}/limits` (dPaaS por device) · facturas x402 con `device_id` |
| Catálogo DApps | `GET /apps` · `GET /apps?q=...` (búsqueda en tabla global `apps` por slug, nombre y descripción) · `GET /apps/{slug}` · `POST /apps/{slug}/install` |
| Voz (diagram.d2: User→Worker "Voz/texto") | `POST /voice {text}` (Bearer cuenta o **device**) → el worker pasa el turno al orquestador (`BRAIN_URL/v1/agentic-gateway`) con la MISMA identidad; la respuesta vuelve a la placa para el TTS. El turno es gratis: los peajes están en lo que el AGENTE pide (ver abajo). En la Pi: mic→whisper.cpp→aquí; respuesta→piper→altavoz |
| Faucet Devnet (pruebas x402) | Se habilita cuando existe URL RPC Devnet, sin depender de la red activa de la cuenta. `GET /api/dev/faucet` muestra la dirección Devnet automática de esa cuenta; `POST` solicita 0.005 SOL con `requestAirdrop` y espera confirmación (cooldown persistente de 60 s por cuenta). El RPC puede aplicar límites adicionales. No opera en mainnet. |
| App peajizada (paso 1-7 del diagrama) | `POST /app/request {path, method?, body?}` — el MCP Gateway: **402 + `x402:app:payload:{METHOD}:{path}`** por petición → X-Payment → PROXY a `{PAYLOAD_URL}{path}` (Payload CMS) con auth automática (`PAYLOAD_TOKEN` o login email/password con JWT cacheado) → el peaje se CONSUME solo si la app respondió; replay 409 · ajeno 403 · app caída no cobra. `X402_APP_LAMPORTS` por petición · brain tool `app_request` |
| x402 | `POST /x402/invoices` · `GET /x402/invoices[/{id}]` · `POST /x402/invoices/{id}/verify` · `POST /x402/pay` (Bearer opcional) · `GET /x402/payouts` · `GET /x402/protected` (demo) |
| Sistema | `GET /health` · `/navbar` · `/modules` · `/device` (protegida por peaje) · `/device/model` (GLB desde object storage, LIBRE) · `/config/solana/urls` · `/solana/status` |
| Agente | `GET /agent/tools` · `POST /agent/call` · `GET /agent/state` |
| MCP | `GET /mcp/status|tools` · `POST /mcp/call` (puente Streamable HTTP) |

## Variables de entorno (`../.env`, único archivo central)

Servidor (`AGENT_OS_API_HOST/PORT`, `AGENT_OS_API_DB_PATH`, `SYNC_INTERVAL_SECS`)
· ERP (`PAYLOAD_URL`) · Solana (`SOLANA_NETWORK`, `SOLANA_{LOCAL,DEVNET,TESTNET,MAINNET}_URL`,
`SOLANA_WALLET`, `SOLANA_PAYER_KEYPAIR`) · x402 (`X402_PAYEE_WALLET`,
`X402_SETTLE_INTERVAL_SECS`, `X402_MAX_VERIFY_ATTEMPTS`, `X402_PROTECTED_PATHS`,
`X402_PATH_LAMPORTS`) · Cuentas (`ACCOUNTS_MASTER_KEY` = base64 de 32 B, obligatoria
para cifrar; sin ella las ops de cifrado fallan con 503 claro) · object storage
(`OBJECT_STORE_BACKEND=local|r2`, default local; `OBJECT_STORE_MODEL_KEY`) · R2
deployments (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `R2_PUBLIC_URL_BASE`, `R2_REGION?`, `R2_API_TOKEN?`) · MCP
(`MEDUSA_MCP_URL/TOKEN`).

## Verificado en pruebas (no romper)

- Registro→login→me→logout (revocación inmediata: reuso → 401).
- keypair import: cifrado AEAD en DB + pubkey derivada; array o string JSON.
- 402 → settled → reintento X-Payment → 200 → **recurso ejecutado** → replay 409.
- Settler por cuenta: usa el keypair y la red DE LA CUENTA (no el global).
- Límites: tx_limit y daily (24 h, excluye `failed`).
- `cargo test`: 15 tests (fmt_sol, base58, tx shape, confirmación RPC, faucet, crypto round-trip).

## Verificador legal S2 (casos simulados de disputas de facturación)

`call-billing-dispute` se conserva porque la suite legal lo usa como ejemplo de
disputa de factura; no permite iniciar llamadas reales.

Capa externa que el agente NO puede manipular: vive en este proceso,
lee `ground_truth/` (0600) y evalúa con reglas deterministas (sin LLM).
Tablas: `legal_runs` (draft→submitted→verified|failed→escalated→signed),
`legal_turns` (traza, role=world solo vía /world), `legal_verdicts`
(pass/fail + omisiones + score), `legal_events` (created/submitted/
verdict/new_evidence/escalation/signoff). Env: `VERIFIER_ENABLED`,
`VERIFIER_GT_DIR`, `VERIFIER_CASES_DIR`, `VERIFIER_UI_PORT=8765`,
`VERIFIER_WORLD_TOKEN`. Módulo `modules/verify.rs`.

| Grupo | Rutas |
|---|---|
| Casos visibles | `GET /legal/cases/{id}/docs` · `GET /legal/cases/{id}/docs/{name}` (Files API S1; antitraversal, sin GT) |
| Runs | `POST /legal/runs {case_id}` · `GET /legal/runs/{id}` (ownership 403) · `POST /legal/runs/{id}/turns` · `POST /legal/runs/{id}/submit` (dispara reglas) · `GET /legal/runs/{id}/events?since=` · `GET /legal/runs/{id}/stream` (SSE snapshot) · `GET /legal/runs/{id}/checklist` (SOLO humanos vía UI :8765 — brain no tiene tool) |
| HITL | `POST /legal/runs/{id}/escalate` · `POST /legal/runs/{id}/signoff {attorney}` (solo cuenta humana 403 device, exige pass, one-shot 409, run inmutable tras firma) · `POST /legal/runs/{id}/world` (Bearer cuenta o X-World-Token; doc .md seguro, excerpt ≤4k) |

Reglas (`verify_now`): must_cite literales → omisión; citas `*.md:` con doc
fuera de permitidos (+world) → HALLUCINATION; distintas < min → MIN_CITATIONS;
world no citado sin frase de refusal → REFUSAL. pass ⟺ cero omisiones.
auto_escalate → failed pasa a escalated. Fail-closed: GT ilegible → fail.
