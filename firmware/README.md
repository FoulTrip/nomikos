# firmware/ — NomikOS Fase 3: el agente de dispositivo

```
firmware/
├── agentd-core/    — lógica portable (no_std): máquina de estados
│                     enroll→claim→token→heartbeat, JSON sin dependencias,
│                     banner del claim (pantalla/serial)
├── agentd-host/    — SIMULADOR (std): la MISMA lógica sobre TCP directo.
│                     Compila ya y valida todo el ciclo contra el api real
│                     cargo run -p agentd-host --release
├── agentd-esp32/   — scaffold del firmware real (esp-hal, ESP32-S3-AMOLED).
│                     EXCLUIDO del workspace (requiere toolchain xtensa):
│                     ver agentd-esp32/README.md
└── state/          — persistencia del simulador (NVS equivalente)
```

## El ciclo (idéntico en simulador y placa)

```
boot → identidad nueva (32B, nunca sale la clave)
 ①  POST /api/devices/enroll {board,name,pubkey}
      → device_id + claim_code + enroll_secret   (código en pantalla/serial)
 ②  [la CUENTA canjea el código en el panel: 📡 Flota → Emparejar]
 ③  POST /api/devices/token (sondeo)             → 202 aún sin claim
                                              200 → Bearer de dispositivo
 ④  POST /api/devices/me/heartbeat cada 15 s    → flota ONLINE
 ⑤  GET /api/device → 402 + invoice (con device_id)
      → la CUENTA paga por dPaaS (el dispositivo NO firma)
      → reintento con X-Payment → 200 one-shot
```

## Modo voz (NomikOS F5, diagram.d2)

`AGENTD_VOICE=1` — el ciclo ④ se convierte en un bucle de VOZ: cada
línea del stdin es un turno del usuario (en la Pi real: **micrófono →
whisper.cpp → esta petición**), se envía a `POST /api/voice` con el
token del dispositivo, el worker lo pasa al orquestador y la respuesta
del agente se imprime (en la Pi: → **piper** → altavoz). Las peticiones
que el AGENTE haga a la app dentro del turno pagan su peaje x402
(`app_request` → 402 → dPaaS → Payload).

```bash
AGENTD_VOICE=1 AGENTD_X402=0 cargo run -p agentd-host --release   # y escribe turnos
```

## Simulador (todo verificado en vivo contra el api real)

```bash
cd firmware
AGENTD_NAME="Mi placa" cargo run -p agentd-host --release
#   → enseña el código; canjéalo en el panel (o con curl):
#     POST /api/devices/claim {"code":"XXXXXXXX"} con Bearer de cuenta
#   → el simulador recibe su token, aparece ONLINE en la flota y
#     ejecuta el peaje x402 (402 → pago de la cuenta → X-Payment → 200).
# Vars: AGENTD_API_URL (default http://localhost:8080/api), AGENTD_STATE,
#       AGENTD_NAME, AGENTD_BOARD, AGENTD_X402=0 (desactiva la demo).
```

## Pendiente para la placa real (ver agentd-esp32/README.md)

Toolchain espup · esp-wifi (estación + HTTP a la LAN) · driver del AMOLED
466×466 (port del C de Waveshare) · NVS · manifiesto esp-web-tools para el
botón de flasheo del modal 📡 Flota del dapp.
