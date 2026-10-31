# agent-os-api

API **Rust** del Agente OS para el dispositivo `ESP32-S3-Touch-AMOLED-1.43`.
Detección sincronizada del estado real (ERP Medusa.js + red Solana), módulo
x402 para micro-peajes on-chain y alojamiento del modelo 3D en **Cloudflare R2**.

> **Nota del entorno:** este proyecto se escribe con Next.js 15 en el dapp y
> axum 0.8 (rutas con parámetros `{id}`, no `:id`).

## Flujo implementado

```
        ┌───► [ Módulo Salud / ERP Avanzado (Kodetap API → Medusa.js) ]
        │                {MEDUSA_URL}/health → service_status
        │
[ Agente (MCP / Muse) ] ──► [ Rust API ] ──► SQLite (fuente de verdad)
        │                │        │
        │                │        └──► [ Cloudflare R2 ]  modelo 3D GLB
        │                │
        └───► [ Módulo x402 Solana ]  (liquida micro-peajes en background)
                   JSON-RPC (getVersion·getSlot·getBalance·sendTransaction)
```

El **Módulo Multimedia (Spotify / MPD)** del diagrama original se **omitió por
diseño**: no está implementado y la API lo reporta como `omitted: true`.

## [ Medusa MCP ] — puente hacia `cloud.medusajs.com/mcp`

La API expone el servidor MCP remoto de Medusa Cloud (Streamable HTTP) como
módulo y herramientas del agente:

| Endpoint | Descripción |
|---|---|
| GET `/api/mcp/status` | Estado del módulo MCP (conectado / necesita OAuth / error) |
| GET `/api/mcp/tools` | Herramientas MCP disponibles |
| POST `/api/mcp/call` | Llama a una herramienta `{"tool": "...", "arguments": {...}}` |

El servidor de Medusa Cloud autentica con **OAuth interactivo**: un proceso
headless no puede completar el flujo de consentimiento en el navegador, así que
la sesión no se establece automáticamente. Para conectar:

```bash
# 1. Desde OpenCode (config ~/.config/opencode/opencode.json):
#    { "$schema": "...", "mcp": { "medusa-commerce": { "type": "remote", \
#      "url": "https://cloud.medusajs.com/mcp" } } }
opencode mcp auth medusa-commerce

# 2. Claude Code:
claude mcp add --transport http medusa-commerce https://cloud.medusajs.com/mcp
claude /mcp   → seleccionar medusa-commerce → Authenticate

# 3. Cursor: .cursor/mcp.json + Settings > Tools & MCPs > Connect
```

Luego, si obtienes un token Bearer, ponlo en `MEDUSA_MCP_TOKEN`. Si no, el módulo
se muestra en `/api/modules` y `/api/agent/call` con `connected: false` y un
`hint` con los pasos, sin bloquear el resto de la API.

Herramientas de agente relacionadas:
- `medusa_mcp_status` — estado en vivo (hace initialize + tools/list)
- `medusa_mcp_list_tools` — lista herramientas MCP
- `medusa_mcp_call` — invoca una herramienta MCP con argumentos

## Cómo funciona

1. **Sincronización a DB** — dos loops en background mantienen SQLite fresco
   con el estado real:
   - ERP: cada `SYNC_INTERVAL_SECS` consulta `{MEDUSA_URL}/health` (timeout 3 s
     → verde/transparente en el navbar).
   - Solana: cada ciclo habla con el JSON-RPC de la red elegida
     (`getVersion`, `getSlot`, `getBalance`) y guarda red, versión del
     validador, slot, wallet y balance en lamports. La wallet se resuelve
     igual que el dapp: `SOLANA_WALLET` (pubkey o ruta) → `keypair_path` del
     CLI (`~/.config/solana/cli/config.yml`) → `~/.config/solana/id.json`.
2. **Estado del dispositivo** — nombre + **ficha técnica** viven en la DB
   (seeds en el primer arranque) junto a los metadatos del modelo 3D (key,
   tamaño, ETag, URL pública opcional).
3. **Modelo 3D** — `GET /api/device/model` siempre descarga el GLB del object
   store configurado (RustFS local o Cloudflare R2, firma SigV4 a mano, sin
   dependencias `object_store`). Nunca sirve el archivo local como fallback.
   `POST /api/device/model/upload` publica el archivo fuente al bucket y
   persiste los metadatos.
4. **x402** — facturas de micro-peajes (`pending → verifying → settled|failed`)
   verificadas on-chain en background por el *settler*; liquidaciones
   salientes encoladas con `POST /api/x402/pay` se firman (ed25519-dalek) y
   confirman solas sin bloquear ninguna petición.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Vista general (uptime, módulos, object store activo) |
| GET | `/api/navbar` | **Datos del navbar**: dispositivo + ERP (rojo/verde) + Solana (red/balance) |
| GET | `/api/modules` | Índice de módulos (multimedia marcado omitido) |
| GET | `/api/erp/status` | Fila de servicio del ERP Medusa.js |
| GET | `/api/solana/status` | Fila de servicio Solana (red, wallet, balance) |
| GET | `/api/device` | Dispositivo + ficha técnica + metadatos del modelo |
| GET | `/api/device/model` | **Sirve el GLB** desde el object store configurado |
| GET | `/api/device/model/head` | 200/404: ¿existe el objeto en el bucket? |
| POST | `/api/device/model/upload` | Publica `DEVICE_MODEL_FILE` al bucket seleccionado |
| POST | `/api/x402/invoices` | Crea factura `{resource, amount_lamports}` |
| GET | `/api/x402/invoices` | Lista últimas 100 facturas |
| GET | `/api/x402/invoices/{id}` | Obtiene una factura |
| POST | `/api/x402/invoices/{id}/verify` | Registra la firma de pago `{tx_signature}` |
| POST | `/api/x402/pay` | Encola liquidación `{to, lamports, memo}` (requiere `SOLANA_PAYER_KEYPAIR`) |
| GET | `/api/x402/payouts` | Últimas liquidaciones |
| GET | `/api/x402/protected` | Demo: responde **402** con factura; admite header `X-Payment: <id>` |
| GET | `/api/agent/state` | Estado agregado para el agente |
| GET | `/api/agent/tools` | Catálogo de herramientas |
| POST | `/api/agent/call` | `{"tool": "...", "args": {...}}` — ejecuta una tool |

Herramientas del agente: `navbar_status`, `device_specs`, `erp_status`,
`solana_status`, `x402_summary`, `create_invoice`, `invoice_status`,
`pay_toll`.

## Ejemplo de ciclo x402 (micro-peaje)

```bash
# 1) La API (o el cliente) crea la factura
curl -X POST localhost:8080/api/x402/invoices \
     -H 'content-type: application/json' \
     -d '{"resource":"reserva-yarda/123","amount_lamports":1000}'
# → { "id": "x402-…", "payee": "…", "status": "pending", … }

# 2) El cliente transfiere esos lamports al payee (memo = id)
#    y pide la verificación con la firma de la tx:
curl -X POST localhost:8080/api/x402/invoices/x402-…/verify \
     -H 'content-type: application/json' \
     -d '{"tx_signature":"<sig base58>"}'
# → status "verifying" … y el settler la confirma en background → "settled"

# 3) Con la factura en "settled", el recurso protegido abre la puerta:
curl -H 'X-Payment: x402-…' localhost:8080/api/x402/protected
# → { "ok": true, "message": "Pago verificado on-chain — acceso concedido" }

# 4) Liquidación saliente en background (requiere SOLANA_PAYER_KEYPAIR):
curl -X POST localhost:8080/api/x402/pay \
     -H 'content-type: application/json' \
     -d '{"to":"<pubkey>","lamports":1000,"memo":"peaje"}'
```

## Variables de entorno

Ver `.env.example` (copiar a `.env`). Resumen:

| Variable | Default | Uso |
|---|---|---|
| `AGENT_OS_API_HOST` / `_PORT` | `127.0.0.1:8080` | Bind |
| `AGENT_OS_API_DB_PATH` | `data/agent-os.db` | SQLite |
| `SYNC_INTERVAL_SECS` | `10` | Periodo de sync ERP+Solana |
| `MEDUSA_URL` | `http://localhost:9000` | ERP Código Kodetap → Medusa |
| `SOLANA_NETWORK` | `devnet` | `local`·`devnet`·`testnet`·`mainnet` |
| `SOLANA_*_URL` | RPC oficiales | URLs por red |
| `SOLANA_WALLET` | CLI local | pubkey o ruta keypair |
| `SOLANA_PAYER_KEYPAIR` | — | keypair para liquidar en background |
| `X402_PAYEE_WALLET` | `SOLANA_WALLET` | cobrador de facturas |
| `X402_SETTLE_INTERVAL_SECS` | `15` | periodo del settler |
| `X402_MAX_VERIFY_ATTEMPTS` | `10` | agotar → factura `failed` |
| `DEVICE_NAME` | `ESP32-S3-Touch-AMOLED-1.43` | nombre del dispositivo |
| `OBJECT_STORE_BACKEND` | `local` | `local` usa RustFS; `r2` usa Cloudflare R2 |
| `DEVICE_MODEL_FILE` | GLB del dapp | fuente para subir; no es una ruta de lectura |
| `OBJECT_STORE_MODEL_KEY` | `models/…glb` | key del objeto (acepta el nombre antiguo `R2_MODEL_KEY`) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | — | obligatorias solo con `OBJECT_STORE_BACKEND=r2` |
| `R2_REGION` / `R2_API_TOKEN` | — | región del endpoint y lectura opcional vía Cloudflare API |
| `R2_PUBLIC_URL_BASE` | — | URL pública opcional para metadatos; el visor usa la API |

## Ejecución

```bash
cargo run            # escucha en http://127.0.0.1:8080
cargo test           # base58, SigV4 (fechas), mensaje de transferencia, fmt SOL
```

## Integración con agent-dapp

- **Navbar** — `ErpStatusSelect` y `SolanaNetworkSelect` ya consumen los
  endpoints del dapp; con esta API Rust pueden apuntar a `…:8080/api/navbar`
  para el mismo dato unificado. Las fichas ("Ficha técnica") salen de
  `/api/device` (DB, seeds).
- **Modelo 3D** — en el dapp, `components/DeviceViewer.tsx` solicita el
  endpoint de la API (`/api/device/model`). La API descarga el GLB del bucket
  local RustFS o de R2, según `OBJECT_STORE_BACKEND`.

## Stack

- **axum 0.8** (rutas `{id}`), tokio multi-thread, tower-http (CORS, tracing).
- **reqwest 0.12** (rustls) — health Medusa + JSON-RPC Solana + object storage.
- **rusqlite 0.31 (bundled)** — WAL, migrations embebidas, seeds.
- **ed25519-dalek 2** — firma de transferencias SOL (tx legacy a mano:
  header `[1,0,1]`, `SystemProgram::Transfer`, compact-u16, base64).
- **sha2/hmac** — SigV4 firmado a mano para R2 (`region=auto`) y RustFS local porque
  `object_store` añade checksums que R2 rechaza.
- **base58 propio** (sin dependencias) para pubkeys/blockhashes/firmas.
