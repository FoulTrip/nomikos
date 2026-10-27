# context.md — firmware/ (NomikOS Fase 3)

Agente de dispositivo (`agentd`) para el ecosistema: el mismo ciclo para
el simulador host y el firmware ESP32-S3-AMOLED.

## Mapa del código

```
agentd-core/src/lib.rs    — no_std: classify/next_action (máquina de estados),
                            json_str/json_num (JSON plano sin deps),
                            write_claim_banner / write_toll_banner (pantalla/serial)
agentd-host/src/main.rs   — std: TCP+HTTP a mano (sin crates de red), NVS≈state/,
                            loop enroll→claim→token→heartbeat + demo x402
agentd-esp32/             — scaffold esp-hal (EXCLUIDO del workspace: toolchain
                            xtensa) — ver su README para el port completo
os-ui/                    — GUI DEL OS, FUENTE ÚNICA (no_std + embedded-graphics
                            + u8g2): el navegador la EJECUTA vía WASM, la placa
                            la ejecutará vía framebuffer (ver NOTA-WASM abajo)
```

## NOTA-WASM — os-ui (la GUI real, sin imitación)

El panel NO dibuja la pantalla en TypeScript: `dapp/components/DeviceScreen.tsx`
llama al WASM compilado de `os-ui` (estado JSON → píxeles RGBA → textura 3D)
y le pasa los toques (`osui_hit`). El mismo crate (sin `std`) compilará para
la ESP32-S3 cuando el driver AMOLED tenga framebuffer + táctil verificados.

- Editar: `firmware/os-ui/src/{draw,hit,icons,text,palette,state}.rs`
- Probar: `cargo test -p os-ui` (hits + humo de render, 12 tests) y
  `cargo check -p os-ui --no-default-features --target thumbv7em-none-eabihf`
- Reconstruir: `make wasm` (deja `dapp/public/wasm/os-ui/*`, COMMITEADO
  porque la imagen docker de node no lleva Rust) + rebuild del dapp.
- Diferencias honestas vs el canvas viejo: velo (no blur) en el shade,
  fuentes u8g2 bitmap (no Geist), iconos geométricos (no Papirus/emoji).
  Geometría, pantallas y textos, idénticos.

## Contratos clave

- El api del dispositivo es el de la Fase 1 (suite 10): enroll/claim/token/
  heartbeat + facturas x402 con `device_id`.
- `agentd-host` no usa TLS ni crates externos: HTTP/1.1 plano por TCP al api
  local (`AGENTD_API_URL`), parser JSON de bytes de `agentd-core`.
- **El dispositivo nunca firma**: el peaje lo paga la cuenta por dPaaS; la
  identidad del dispositivo (32 bytes) solo lo identifica.
- Estado persistido: `state/device.json` (host) / NVS (placa) con pubkey,
  device_id, enroll_secret y token.
- `AGENTD_X402=0` desactiva la demo del peaje; heartbeat 15 s; poll de
  token 5 s; espera de pago 180 s.
- **Modo voz (F5)**: `AGENTD_VOICE=1` — stdin = turnos (mic/whisper de la
  Pi) → `POST /api/voice` con el token del dispositivo; la respuesta del
  orquestador se imprime (→ piper/altavoz). `AGENTD_X402=0` recomendado
  en voz para no mezclar la demo del peaje.
- **Puente SIP (W4)**: `AGENTD_SIP=1` — el agente consulta SU llamada
  (`GET /api/calls/for-device`, cada 3 s) y mueve el audio con baresip
  en pipe mode: `active` → `/dial sip:destino[@AGENTD_SIP_DOMAIN]`,
  terminada → `/hangup`. `AGENTD_SIP_CMD` sustituye baresip (mock en
  la suite 14); el peaje x402 por minuto vive en el api.

## Servicios que consume

| Puerto | Servicio | Uso |
|---|---|---|
| 8080 | api (Rust) | enroll/claim/token/heartbeat + recurso protegido con peaje x402 |
