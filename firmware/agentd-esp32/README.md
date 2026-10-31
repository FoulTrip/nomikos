# agentd-esp32 — firmware NomikOS para el ESP32-S3-Touch-AMOLED-1.43

El ciclo del agente (enroll → claim → token → heartbeat → peaje x402)
vive en `agentd-core` (no_std, validado por `agentd-host` contra el api
real). Este crate aporta los periféricos de la placa Waveshare:

| Módulo | Qué hace |
|---|---|
| `src/main.rs` | Boot esp-hal 0.23 (240 MHz, heap 72 KB), SPI del AMOLED, WiFi STA + DHCP, arranque del ciclo |
| `src/net.rs` | Stack TCP blocking sobre smoltcp 0.12 (el glue que esp-wifi ya no trae): DHCP + un socket reutilizable |
| `src/http.rs` | HTTP/1.1 minimalista (`Connection: close`), request/response + parser de JSON plano de agentd-core |
| `src/agent.rs` | El ciclo F1-F4 del diagrama + demo del peaje x402 (402 → poll settled → reintento con X-Payment) |
| `src/display.rs` | Driver RM67162 (AMOLED 466×466, framing QSPI 0x02/0x32) + `embedded-graphics`: **claim code en pantalla** |
| `src/state.rs` | Identidad TRNG (hex 64); persistencia NVS pendiente (ver abajo) |

## Compilar y flashear

```sh
# 1) Toolchain xtensa (una vez): cargo install espup && espup install --targets esp32s3
# 2) Credenciales WiFi en compile-time + IP LAN del api (src/config.rs):
cd firmware/agentd-esp32
SSID=MiRed PASSWORD=secreto cargo build --release
cargo flash        # = espflash flash --monitor (ver .cargo/config.toml)
```

**El binario compila** (release ≈ 930 KB). El flasheo requiere la placa.

## Verificaciones de hardware pendientes (primera placa que conectes)

El firmware está listo para compilar y flashear, pero dos cosas se
deben contrastar con el esquemático/demo C de Waveshare en el primer
contacto físico:

1. **Pines del AMOLED** (`display.rs::BOARD_PINS`): SCK=IO6, SDA=IO7,
   CS=IO8, DC=IO9, RST=IO10 (familia documentada en el wiki Waveshare).
2. **Secuencia de init del RM67162** (`INIT` en `display.rs`): aquí va
   la mínima documentada (reset/sleep-out/display-on + MADCTL). El demo
   C de Waveshare tiene la secuencia completa de registros.
3. **Modo quad de datos**: el framing 0x32 asume la fase de datos en 4
   líneas (QSPI). Hoy el SPI va en 1 línea: para el caudal real de píxeles
   configura el ESP32-S3 SPI en 1-1-4 (esp-hal `DataMode`) — los textos
   del claim code funcionan igual.
4. **Persistencia NVS** (`state.rs`): esp-storage 0.4 escribe flash a
   offsets crudos; sin el mapa de particiones del bootloader es riesgo
   de brick. v0.1 re-enrola en cada arranque (claim code en pantalla).

## Arquitectura (por qué sin embassy)

El stack blocking propio evita embassy-net para un cliente secuencial:
una petición = una conexión. `POST /api/voice` queda como siguiente paso
(el ciclo de identidad de dispositivo y x402 ya está completo).
