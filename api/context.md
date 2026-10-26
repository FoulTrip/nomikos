# context.md — api/ (Rust)

API del Agente OS: **fuente única de verdad** (axum 0.8 + SQLite + tokio).
Puerto `:8080`. Binario `agent-os-api` (el nombre de paquete NO cambia aunque
la carpeta sea `api/`).

## Mapa del código

```
api/src/
├── main.rs          — bootstrap: config, DB, spawns (sync_loop, settler), servidor
├── config.rs        — Config::load() lee .env (dotenv a mano); R2Config; master key
├── api.rs           — router (TODAS las rutas) + handlers generales + middleware gate
├── db.rs            — SQLite (WAL): schema + migraciones idempotentes + helpers
├── crypto.rs        — argon2id + XChaCha20-Poly1305 (seal/open) + tokens de sesión
├── state.rs         — SharedState = Arc<AppState{cfg, db, http, r2, mcp, started_at}>
├── error.rs         — AppError → JSON {"ok":false,"error":…}
├── b58.rs / r2.rs   — base58 a mano / cliente R2 SigV4 (PUT/GET)
└── modules/
    ├── accounts.rs  — IdP (register/login/logout/me), config por cuenta,
    │                  keypair import (cifra + deriva pubkey), sub-wallets,
    │                  resolve_account_id (identidad opcional), /me/context
    ├── x402.rs      — facturas, verify on-chain, payouts, settler_loop,
    │                  middleware x402_gate (402 reactivo), settle_access
    │                  (one-shot), dPaaS (resolve_payer, check_limits,
    │                  pay_invoice delegado, handlers /me/x402/*)
    ├── solana.rs    — SolanaClient (JSON-RPC), wallets CLI, transferencia
    │                  firmada (ed25519, transfer_lamports_with_kp)
    ├── device.rs    — ficha técnica + modelo 3D 100% desde R2 (sin fallback)
    └── erp.rs       — salud del ERP (Payload CMS: {PAYLOAD_URL}/api/users)
```

## Modelo de datos (SQLite, `api/data/agent-os.db`)

| Tabla | Contenido |
|---|---|
| `accounts` | email único, `password_hash` (argon2id PHC), display_name, is_active |
| `account_llm` | provider, base_url, api_key_enc (AEAD), models JSON, default_model |
| `account_chain` | network, wallet_pubkey, payer_keypair_enc (AEAD), payee, daily/tx_limit, **active_wallet_label** (wallet operativa del agente: label de sub-wallet o NULL = principal dPaaS) |
| `account_wallets` | sub-wallets por cuenta: label, network, pubkey, keypair_enc, daily_limit |
| `account_connected_wallets` | **wallets del navegador (Phantom/MetaMask/…)**: label, provider, chain (solana\|evm), **solo pubkey** (la clave privada nunca sale de la wallet), is_active (una por cuenta), UNIQUE(account_id, label) |
| `account_services` | **dapps que el agente usará con x402**: service, display_name, via_x402=1, resource del peaje (`x402:path:…`), snapshot payer_pubkey/network, status, UNIQUE(account_id, service) |
| `devices` | **NomikOS Fase 1 — flota**: pubkey ed25519 de la placa, board, claim_code (15 min, NULL tras claim), enroll_secret_hash (sha256), status/last_seen_at, límites dPaaS por dispositivo, account_id (NULL hasta el claim) |
| `calls` | **NomikOS Fase 5 — llamadas con peaje x402/min**: destination, status (ringing/active/ended), minutes_paid, device_id (si la origina un dispositivo), started_at/ended_at |
| `sessions` | `token_hash` (sha256 del token opaco), account_id, expires_at · **columna `device_id`**: un token de DISPOSITIVO es una sesión ligada a un device (TTL 30 días) |
| `login_attempts` | email, at, ok (anti-bruteforce 5/min) |
| `x402_invoices` | id, resource, amount, payee, status(pending/verifying/settled/failed), tx_signature, **account_id**, **consumed_at** (one-shot) |
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

## Endpoints (`:8080/api`)

| Grupo | Rutas |
|---|---|
| Auth | `POST /auth/register` (201/409/400) · `POST /auth/login` (token Bearer; 401; 429 tras 5 fallos) · `POST /auth/logout` · `GET /auth/me` |
| Cuenta | `PUT/DELETE /accounts/me/llm` (provider, api_key AEAD, base_url, models, default_model; DELETE desconecta → brain vuelve al backend global) · `PUT /accounts/me/chain` (network + **active_wallet_label** tri-state: label/null/ausente) · `POST /accounts/me/chain/keypair/import` (cifra; acepta array o string) · `GET /accounts/me/context` (resolución completa para brain, incluye active_wallet_pubkey) · `GET/POST /accounts/me/wallets` · `GET/POST /accounts/me/connected-wallets` (Phantom/MetaMask/… — solo pubkeys; conectar la marca como en uso, `PUT …/connected-wallets/activate {label}` cambia cuál) · `GET/POST /accounts/me/services` (catálogo de dapps x402 + alta que persiste cuenta→servicio→x402 con snapshot dPaaS; 201/409/400) |
| dPaaS | `GET /accounts/me/x402/summary` · `GET /accounts/me/x402/invoices` · `POST /accounts/me/x402/pay` · `POST /accounts/me/x402/pay-invoice` |
| Flota (NomikOS) | `POST /devices/enroll` (placa sin auth → claim_code 15 min + enroll_secret) · `POST /devices/claim {code}` (Bearer cuenta, atómico) · `POST /devices/token` (la placa sondea con enroll_secret → Bearer de dispositivo, 202 antes del claim) · `GET /devices/me` + `POST /devices/me/heartbeat` (token de dispositivo) · `GET /devices` (flota de la cuenta) · `PUT /devices/{id}/limits` (dPaaS por device) · facturas x402 con `device_id` |
| Llamadas (NomikOS F5) | `POST /calls` (sin X-Payment → crea ringing + peaje del min 0 → **402**; con X-Payment settled → consume el minuto one-shot, pasa a `active` y emite el peaje del SIGUIENTE en la respuesta — cadencia un POST/min, precio `X402_CALL_LAMPORTS`) · `GET /calls/{id}` · `POST /calls/{id}/end` · brain tools `place_call`/`end_call` (guarded_call paga y reintenta solo) |
| Voz (diagram.d2: User→Worker "Voz/texto") | `POST /voice {text}` (Bearer cuenta o **device**) → el worker pasa el turno al orquestador (`BRAIN_URL/v1/agentic-gateway`) con la MISMA identidad; la respuesta vuelve a la placa para el TTS. El turno es gratis: los peajes están en lo que el AGENTE pide (ver abajo). En la Pi: mic→whisper.cpp→aquí; respuesta→piper→altavoz |
| Faucet Devnet (W6 — settlement real) | `GET /api/dev/faucet` → estado del treasury `{network, treasury_pubkey, treasury_balance_lamports, lamports_per_drip}` · `POST /api/dev/faucet` (Bearer cuenta, chain **devnet**) → transfiere `FAUCET_LAMPORTS` (default 0.05 SOL) del treasury a la wallet dPaaS de la cuenta — tx real; cooldown 10 s; `FAUCET_ENABLED=0` → 404 oculto. Treasury: `scripts/faucet/nomikos-treasury.json` (SOLO devnet) + `faucet.sh {status\|pubkey\|balance\|fund [N]\|drip <pub>}` |
| Puente baresip (W4) | `GET /api/calls/for-device` (Bearer de **dispositivo**) → la llamada en curso de la placa, respuesta PLANA para el firmware no_std: `{has_call:"true"/"false", call_id, call_status, call_destination, minutes_paid}`. La Pi marca con `active` y cuelga cuando desaparece (`AGENTD_SIP=1` en agentd → baresip pipe mode) |
| App peajizada (paso 1-7 del diagrama) | `POST /app/request {path, method?, body?}` — el MCP Gateway: **402 + `x402:app:payload:{METHOD}:{path}`** por petición → X-Payment → PROXY a `{PAYLOAD_URL}{path}` (Payload CMS) con auth automática (`PAYLOAD_TOKEN` o login email/password con JWT cacheado) → el peaje se CONSUME solo si la app respondió; replay 409 · ajeno 403 · app caída no cobra. `X402_APP_LAMPORTS` por petición · brain tool `app_request` |
| x402 | `POST /x402/invoices` · `GET /x402/invoices[/{id}]` · `POST /x402/invoices/{id}/verify` · `POST /x402/pay` (Bearer opcional) · `GET /x402/payouts` · `GET /x402/protected` (demo) |
| Sistema | `GET /health` · `/navbar` · `/modules` · `/device` (protegida por peaje) · `/device/model` (GLB desde R2, LIBRE) · `/config/solana/urls` · `/solana/status` |
| Agente | `GET /agent/tools` · `POST /agent/call` · `GET /agent/state` |
| MCP | `GET /mcp/status|tools` · `POST /mcp/call` (puente Streamable HTTP) |

## Variables de entorno (`api/.env`)

Servidor (`AGENT_OS_API_HOST/PORT`, `AGENT_OS_API_DB_PATH`, `SYNC_INTERVAL_SECS`)
· ERP (`PAYLOAD_URL`) · Solana (`SOLANA_NETWORK`, `SOLANA_{LOCAL,DEVNET,TESTNET,MAINNET}_URL`,
`SOLANA_WALLET`, `SOLANA_PAYER_KEYPAIR`) · x402 (`X402_PAYEE_WALLET`,
`X402_SETTLE_INTERVAL_SECS`, `X402_MAX_VERIFY_ATTEMPTS`, `X402_PROTECTED_PATHS`,
`X402_PATH_LAMPORTS`) · Cuentas (`ACCOUNTS_MASTER_KEY` = base64 de 32 B, obligatoria
para cifrar; sin ella las ops de cifrado fallan con 503 claro) · R2 (`R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_MODEL_KEY`,
`R2_PUBLIC_URL_BASE`, `R2_REGION?`) · MCP (`MEDUSA_MCP_URL/TOKEN`).

## Verificado en pruebas (no romper)

- Registro→login→me→logout (revocación inmediata: reuso → 401).
- keypair import: cifrado AEAD en DB + pubkey derivada; array o string JSON.
- 402 → settled → reintento X-Payment → 200 → **recurso ejecutado** → replay 409.
- Settler por cuenta: usa el keypair y la red DE LA CUENTA (no el global).
- Límites: tx_limit y daily (24 h, excluye `failed`).
- `cargo test`: 12 tests (fmt_sol, base58, tx shape, crypto round-trip).
