# NomikOS — ecosistema agéntico de dispositivos con peajes x402

Cada cuenta (email + password) tiene su orquestador: razona con **su**
proveedor LLM (NVIDIA NIM / OpenAI / custom), opera en **su** red Solana
con **su** wallet delegada (dPaaS) y paga micro-peajes x402 de forma
invisible — **el usuario nunca firma nada**. Los dispositivos (Raspberry
Pi 4 con NomikOS · ESP32-S3 AMOLED) hablan por voz con el agente y la
flota se empareja desde el panel del navegador.

El flujo autoritativo está en [`diagram.d2`](diagram.d2) (render:
`diagram.svg`) y el diseño por fases en
[`docs/nomikos-design.md`](docs/nomikos-design.md).

```
 Usuario habla por el mic de la Pi4
    │ (NomikOS: whisper.cpp local → texto)
    ▼
 api :8080 (Rust — fuente única de verdad)
    ├─ POST /api/voice  → brain :8322 (orquestador, 15 tools,
    │                        shields Llama Guard in/out, LLM de la cuenta)
    │        │ tool app_request
    │        ▼
    │   POST /api/app/request → 402 + peaje → dPaaS firma (tx real)
    │        → reintento X-Payment → PROXY a la app
    │                     ▼
    │            Payload CMS :3100 (la app del ecosistema)
    ├─ Flota: enroll → claim code → token de dispositivo → heartbeat
    ├─ Llamadas: sesión + peaje x402 por minuto (baresip en la placa)
    └─ Faucet Devnet: treasury → wallet dPaaS de la cuenta (💧 en el panel)
 dapp :3000 (Next.js 16) — sesión Auth.js + panel con modales:
    Wallet·Red (faucet 💧, sub-wallets, Phantom/MetaMask) · Modelos ·
    Servicios · 📡 Flota (emparejar por claim code + instalador web serial)
```

## El handshake x402 (el corazón de todo)

```
1. HTTP Request ──► recurso protegido (app, llamada, minuto, device…)
2. HTTP 402  ◄── invoice {id, payee, amount} (uno por petición)
3. Pide firma ──► dPaaS: descifra el keypair de la cuenta, valida límites,
                    firma ed25519 en memoria, envía a SU red (Devnet)
4. X-Payment ◄── tx_signature on-chain
5. Reintento firmado ──► verify (settled + one-shot) → consume
6. Tool call ──► EL RECURSO SE EJECUTA (proxy a la app real)
7. Ledger ──► SQLite: consumed_at → replay = 409
```

## Componentes

| Directorio | Stack | Rol |
|---|---|---|
| [`api/`](api/) | Rust · axum 0.8 · rusqlite · argon2 · XChaCha20-Poly1305 · ed25519 (sin SDK) | Fuente única de verdad: IdP, gateway 402, dPaaS, flota, voz, llamadas, faucet Devnet, x402 |
| [`brain/`](brain/) | Python 3.13 · FastAPI · Ollama (shields Llama Guard) | Orquestador: exige Bearer + LLM de la cuenta (sin fallback global), shields in/out, 15 tools, guard x402 reactivo |
| [`dapp/`](dapp/) | Next.js 16 · Auth.js v5 · React 19 | Panel del navegador: sesión, wallet/red, modelos, servicios, flota + instalador web (Web Serial) |
| [`firmware/`](firmware/) | Rust no_std | `agentd-core` (máquina de estados), `agentd-host` (simulador: voz + puente SIP), `agentd-esp32` (AMOLED 466×466, compila para xtensa) |
| [`os/`](os/) | Buildroot (BR2_EXTERNAL) + shell | Imagen Linux de la Pi4: `sdcard.img` con agentd, whisper, piper y systemd · bucle de voz `os/voice/` |
| `dapps/payload-cms/` (clon upstream, no versionado) | Payload CMS 3 · D1 | LA APP del ecosistema (a la que el agente paga peaje por petición) — ver [`dapps/CONTEXT-payload-cms-local.md`](dapps/CONTEXT-payload-cms-local.md) |
| [`tests/`](tests/) | tester-army e2e (Node) | 16 suites / 70 tests E2E de punta a punta |
| [`docs/`](docs/) | — | `nomikos-design.md`: fases, auditorías, decisiones |

## Puertos y arranque

**La forma es `make`** (el `.env` de la raíz es la única configuración):

```bash
cp .env.example .env      # y llena lo que uses (key NIM, etc.)
make secrets              # genera ACCOUNTS_MASTER_KEY / AUTH_SECRET / PAYLOAD_SECRET
make install              # una vez por máquina: builds, venvs, modelos de ollama
make up                   # prende TODO: api, brain, stack NIM, ollama, dapp y la app
make status               # salud
make test                 # batería E2E rápida (39 tests)
make image                # la imagen NomikOS para la Pi (sdcard.img)
make flash DISK=/dev/sdX  # (tú lo ejecutas) escribe la microSD
make help                 # todo lo demás
```

**O en docker** (`api` + `dapp` en contenedores; brain/ollama/la app en
el host vía `host.docker.internal`): `make down && docker compose up
--build` → panel en `http://localhost:3000` — el panel detecta la
ejecución local/docker, simula la placa con NomikOS adentro y el
progreso del OS vive en la DB de la cuenta.

Para la placa: `make image` produce `~/os-build/images/sdcard.img`
(lleva agentd + voz + puente SIP — **sin** dapp/brain, esos viven en la
PC). El ESP32 de la flota: `make esp32-flash SSID=… PASSWORD=…`.

Arranque manual (equivalente, por servicio):

| Puerto | Servicio | Comando |
|---|---|---|
| 8080 | api | `cd api && cargo run` |
| 8322 | brain (exige Bearer + LLM de cuenta) | `cd brain && .venv/bin/python -m uvicorn app.main:app --port 8322` |
| 11434 | Ollama (SOLO shields Llama Guard) | `ollama serve` |
| 3000 | dapp | `cd dapp && npm run dev` |
| 3100 | app (Payload CMS) | `cd dapps/payload-cms/templates/with-cloudflare-d1 && pnpm dev --port 3100` |

La configuración vive en el **`.env` central de la raíz** (plantilla:
`.env.example`); `make env` la sincroniza a cada proyecto. Para integrar
una app nueva al ecosistema (que el orquestador pague por peaje):
[`dapps/README.md`](dapps/README.md).

Prueba de humo (`make test-smoke` hace esto):

```bash
curl -s http://localhost:8080/api/health -o /dev/null -w "api → %{http_code}\n"
curl -s http://localhost:8322/v1/health -o /dev/null -w "brain → %{http_code}\n"
# gateway sin Bearer → 401: el agente exige cuenta con LLM propio
curl -s -X POST http://localhost:8322/v1/agentic-gateway \
  -H "Content-Type: application/json" -d '{"text":"hola"}' -o /dev/null -w "gateway → %{http_code}\n"
```

## Flota, voz y hardware

- **Tienda de apps**: `nomikos apps` lista las dapps del worker,
  `nomikos apps add <slug>` las instala (script probado, idempotente) y
  sus tools entran al MCP manager del agente. En la placa el mismo CLI
  corre en la consola (viene en la imagen). Ver [`dapps/README.md`](dapps/README.md).
- **Pi4**: flashea `~/os-build/images/sdcard.img` (se genera con
  `os/README.md`) → ethernet → el claim code sale por consola →
  canjear en el panel 📡 Flota. Con micrófono USB, el bucle de voz
  (`agentd-voice.service`) arranca solo tras el emparejado.
- **ESP32-S3-AMOLED-1.43**: `cd firmware/agentd-esp32 &&
  SSID=… PASSWORD=… cargo flash` — claim code en el AMOLED (las 4
  verificaciones de hardware están en su README).
- **Settlement real**: el treasury Devnet gotea SOL a las wallets dPaaS
  (botón 💧 del panel o `POST /api/dev/faucet`) y cada peaje liquida
  on-chain (`api/scripts/faucet/`).

## Pruebas

```bash
cd tests && npm run test:e2e -- tests/13.settlement.real-chain.e2e.ts
```

16 suites (01–16): salud, IdP, cuenta, x402, brain (auth + LLM de cuenta),
escalabilidad, dapp sesión, servicios/wallets, flota, llamadas,
voz+app peajizada, **settlement real on-chain**, **puente SIP**,
**tienda de apps** y **simulador NomikOS**. Los servicios deben estar
arriba; `workers: 1`.

## Seguridad

- Passwords argon2id; tokens opacos (solo hash en DB); sesiones revocables.
- Secretos en reposo (api_keys, keypairs) cifrados con
  `ACCOUNTS_MASTER_KEY` (XChaCha20-Poly1305) — **nunca en logs**.
- Peajes one-shot (`consumed_at`) con ownership por cuenta (403 ajeno).
- Shields Llama Guard 3 a la entrada y salida del razonamiento.
- **No se sube al repo** (`.gitignore`): `.env` reales,
  `dapp/credentials.json`, el ledger `api/data/`, el keypair del faucet.
  Plantillas: `*/.env.example` de cada proyecto.

## Estado

Fases 1–5 del diseño **✅ completas** (ver
[`docs/nomikos-design.md`](docs/nomikos-design.md), tabla W incluida) y
16/16 suites verdes. Pendientes de mundo físico (documentados, sin
código detrás): flashear la microSD, conectar el ESP32, micrófono/altavoz
en la Pi y (opcional) credenciales de trunk SIP.
