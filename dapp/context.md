# context.md — dapp/ (Next.js 16)

Simulador **Zero-UI** del dispositivo `ESP32-S3-Touch-AMOLED-1.43` + consola
del agente. **No guarda estado de negocio**: TODO pasa por `api` (Rust :8080)
a través de `API_GATEWAY_URL`.

> `AGENTS.md` de este directorio es autogenerado por `next dev` (reglas de
> Next.js 16 — APIS rompientes vs training data). No editarlo a mano: se
> re-escribe solo. Este `context.md` es el contexto estable del proyecto.

## Gestión de sesión (Auth.js v5 + proxy.ts)

- **`/`** es la landing pública (estilo cálido claro, ver
  `components/landing/` + sección `.landing` en `globals.css`): igual para
  todos, con CTAs a **`/signin`** (login) y **`/signup`** (registro, ambos
  bajo `app/(auth)/` con logo y marco compartidos; con sesión redirigen a
  `/panel`). **`/panel`** = shell del simulador (autenticado). El
  enrutamiento vive en `proxy.ts` (Next.js 16 renombró `middleware.ts` →
  `proxy.ts`, matcher `/`, `/en`, `/es`, `/signin`, `/signup`,
  `/panel/*`: primero reglas de auth, luego negociación next-intl).
- Tema: landing, auth y `/panel` usan el sistema cálido claro
  (`.theme-light` en `globals.css`; `:root` oscuro queda solo como base).
  Excepciones oscuras intencionales: pantalla AMOLED, consola serial y
  loader 3D usa fondo piedra `#F2EBE0` con dispositivo grafito.
- El IdP real es `api` (`/api/auth/register|login|logout|me`, tokens opacos
  con TTL 7 días, anti-bruteforce 5 fallos/min). **Auth.js no crea sesiones
  paralelas**: el Credentials provider (`auth.ts`) hace login contra
  `POST {API_GATEWAY_URL}/auth/login` y guarda el Bearer como claim del JWT
  cifrado en la cookie HTTP-Only (`strategy: "jwt"`, `maxAge` 7 días = TTL
  del token de api).
- Los proxies del dapp reenvían ese Bearer como `Authorization: Bearer` para
  operar como la cuenta (`app/api/agent/gateway` → brain `/v1/agentic-gateway`
  resuelve el contexto de la cuenta: LLM, red, wallet dPaaS — flujo de
  `tests/06`).
- Errores del IdP mapeados con `CredentialsSignin.code`: `credentials`
  (401) y `rate_limited` (429 tras 5 fallos). `logoutAction` revoca el token
  en api ANTES de destruir la cookie (semántica one-shot del test E2E 02).
- Contrato validado por `tests/tests/08.dapp.session.e2e.ts` (landing →
  login → cookie → /panel → gateway con Bearer → logout → redirect).
- i18n solo en la landing (next-intl, `es` sin prefijo + `/en`):
  `i18n/routing.ts` + `i18n/request.ts` + `messages/{es,en}.json` +
  `app/[locale]/`. El resto de la app queda en español y usa `next/link`
  plano (el `Link` de `@/i18n/navigation` es SOLO para el conmutador
  English | Español: prefijaría `/signin` y rompería la ruta).

## Mapa del código

```
dapp/
├── auth.ts                       — Auth.js v5: Credentials → api /auth/login,
│                                   Bearer como claim del JWT (cookie cifrada)
├── next-auth.d.ts                — augmentación de tipos (Session/JWT/User)
├── proxy.ts                      — enrutador de sesión Next.js 16: / ⇄ /panel
├── app/
│   ├── page.tsx                  — login + registro ("/", sin sesión)
│   ├── panel/page.tsx            — shell autenticado: navbar + visor 3D +
│   │                               consola gateway + ficha técnica + logout
│   ├── actions/auth.ts           — server actions: login/register/logout
│   │                               (logout revoca el token en api)
│   └── api/
│       ├── auth/[...nextauth]/route.ts — handlers de Auth.js v5
│       ├── account/context|chain|llm|services|connected-wallets/route.ts — proxies del panel
│       ├── account/devices/route.ts — flota de la cuenta (GET /devices)
│       ├── account/devices/claim/route.ts — emparejado del modal Flota
│       │                               (wallet operativa, red, LLM, dapps x402)
│       ├── agent/gateway/route.ts — proxy → brain /v1/agentic-gateway
│       │                            adjuntando el Bearer de la sesión
│       ├── agent/chat/route.ts   — chat directo (nvidia|meta|custom|simulado)
│       ├── erp/status/route.ts   — proxy → {API}/erp/status
│       ├── device/model/route.ts — proxy → {API}/device/model (GLB desde R2)
│       ├── device/state|tap|reset/route.ts — estado del OS simulado
│       ├── solana/status/route.ts— URLs RPC desde {API}/config/solana/urls
│       └── ai/models/route.ts    — catálogo models.dev + validación de key
├── components/
│   ├── AuthForm.tsx              — tabs login/registro (useActionState)
│   ├── panel/TopbarTools.tsx     — botones "Wallet · Red", "Modelos",
│   │                               "Servicios" y "Flota" + modales de cuenta
│   ├── panel/FleetModal.tsx      — NomikOS Fase 2: flota, emparejado (claim
│   │                               code) e instalador (Web Serial + consola
│   │                               con autodetección de claim codes; flash
│   │                               esp-web-tools al publicar manifiesto F3)
│   ├── panel/ModalShell.tsx      — overlay/tarjeta compartidos por los modales
│   ├── DeviceViewer.tsx          — Three.js; MODEL_URL = "/api/device/model"
│   │                              (loader = DOM plano con useProgress, NO <Html>
│   │                              de drei: su root.unmount en useLayoutEffect
│   │                              crashea el commit de React 19 al navegar)
│   ├── DeviceScreen.tsx          — pantalla AMOLED simulada (home ⇄ agente)
│   ├── AgentConsole.tsx          — componente de consola (direct/gateway);
│   │                              NO se renderiza en el panel (el chat con
│   │                              el agente se hace tocando la pantalla 3D
│   │                              o vía gateway). Queda disponible a nivel
│   │                              de librería.
│   ├── AIProviderPanel.tsx / ErpStatusSelect / SolanaNetworkSelect
│   │                              (huérfanos: su función vive en los modales
│   │                              del panel — Modelos reemplazó a AIProviderPanel)
├── lib/
│   ├── account-proxy.ts           — forward al panel hacia api con el Bearer
│   ├── os/ (device-os, store, types, d1) — singleton server-side del "device OS"
│   ├── ai/providers.ts           — NVIDIA NIM / Meta Llama / custom (OpenAI-compat)
│   └── screen/draw.ts
└── scripts/d1-schema.sql         — esquema del ledger D1 (referencia)
```

## Contratos clave

- **`.env`**:
  - `API_GATEWAY_URL=http://localhost:8080/api` — única variable de
    **negocio** (en Docker: `http://api:8080/api`). Nada de MEDUSA_URL ni
    URLs de Solana: viven en `api`.
  - `AUTH_SECRET=<openssl rand -base64 32>` — cifra la cookie de sesión de
    Auth.js (requerida; en Docker se pasa por `docker-compose.yml`).
  - `BRAIN_URL=http://localhost:8322` — gateway agéntico para operar como
    cuenta desde el panel (en Docker: `http://brain:8322`).
- `DeviceViewer` carga el GLB con `useGLTF("/api/device/model", false, true)`
  (compresión meshopt, decodificador local). NO volver a `NEXT_PUBLIC_MODEL_URL`.
- `solana/status` resuelve las URLs RPC desde `api` (`/config/solana/urls`)
  y la wallet local vía CLI (~/.config/solana) o `SOLANA_WALLET`.
- Docker: `output: "standalone"`, puerto `3123`, contexto `./dapp`.

## Servicios que consume

| Puerto | Servicio | Uso |
|---|---|---|
| 8080 | api (Rust) | IdP (login/registro/revocación) + navbar, ERP, modelo 3D (R2), URLs Solana |
| 8322 | brain (FastAPI) | Gateway agéntico con Bearer de la cuenta (panel) |
| 3000 | dapp (dev) | `npm run dev` (Docker: :3123) |

## Notas de integración con el ecosistema

- El flujo agéntico conversacional completo (shields + tool-calls + x402
  delegado) vive en `brain` (`:8322/v1/agentic-gateway`); el dapp lo expone
  como API con el Bearer de la sesión (`app/api/agent/gateway` — contrato de
  la suite 08). El panel no renderiza consola de chat: la interacción con
  el agente es táctil (pantalla 3D del dispositivo) o por API. El LLM que
  usa brain se configura por cuenta desde el modal **Modelos**
  (`account_llm`).
- La revocación del logout es la semántica del IdP: token reusado → 401
  (test E2E 02); la cookie del dapp muere junto al token.

## Panel: wallet operativa y servicios x402 de la cuenta

El topbar del panel tiene dos botones (reemplazan a los antiguos selects
de ERP/Solana) que abren modales operando como la cuenta vía
`lib/account-proxy.ts` (forward con el Bearer de la sesión — el navegador
nunca ve el token):

- **⛓️ Wallet · Red** (`components/panel/TopbarTools.tsx` → WalletModal):
  - **Wallet firmante · Solana (dPaaS)**: wallet operativa del agente
    (principal dPaaS o sub-wallets de `GET /accounts/me/wallets`) →
    `PUT /api/account/chain` → `account_chain.active_wallet_label`
    (tri-state en api: label / null=principal / ausente=no toca). El
    contexto (`/accounts/me/context`) resuelve `active_wallet_pubkey`.
  - **Wallets del navegador**: conectar **Phantom / Solflare / Backpack /
    MetaMask** desde la extensión (`window.phantom.solana`, `solflare`,
    `backpack`, `ethereum`). Se guarda **solo la pubkey** en
    `account_connected_wallets` (la clave privada nunca sale de la
    wallet — no se recibe ni se guarda; proxy
    `/api/account/connected-wallets`). Se pueden agregar **varias; solo
    una queda en uso** (`is_active`, invariante server-side) con botón
    "Usar" para cambiarla.
- **🤖 Modelos** (ModelsModal): proveedor LLM de la cuenta (NVIDIA NIM /
  OpenAI / Meta Llama API / Llama Stack local / personalizado OpenAI-compat),
  API key y modelo. "Cargar modelos" valida la key en vivo
  (`POST /api/ai/models` — listado real del proveedor + ping con timeout
  30 s) y al guardar persiste en `account_llm` vía
  `PUT /api/account/llm` (api_key sellada AEAD; sin key nueva conserva la
  guardada). **Desconectar** (`DELETE /api/account/llm`) borra el config y
  el agente vuelve al backend global. Es el LLM con el que `brain` razona
  como la cuenta. Reemplaza al antiguo `AIProviderPanel` (config local
  del chat directo), ya fuera del panel.
- **🧩 Servicios** (ServicesModal): catálogo de dapps del agente
  (`GET/POST /api/account/services` → api). Agregar **Medusa** persiste
  en `account_services` el registro cuenta→servicio→**x402**: `via_x402=1`,
  resource del peaje (`x402:path:/api/erp/*`) y snapshot del payer dPaaS
  + red en el momento del alta. Contrato congelado en la suite E2E 09.
- **📡 Flota** (FleetModal — NomikOS Fase 2): tres pestañas —
  **Mi flota** (`GET /api/account/devices` → api `/devices`: online/offline,
  versión, dPaaS por device), **Emparejar** (canje del claim_code de la
  placa → `POST /api/account/devices/claim` → api `/devices/claim`) e
  **Instalador** (detección de placa por USB con Web Serial — VID/PID
  Espressif/CP210x/CH340 — y **consola serial en vivo** a 115200 con
  autodetección de claim codes «usar como código»; el flasheo web con
  esp-web-tools se activa solo cuando exista
  `/public/installer/manifests/{board}.json` — lo publica la Fase 3).
