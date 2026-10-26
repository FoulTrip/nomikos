# os/voice — el bucle de voz de NomikOS (W1)

El flujo del diagrama (`A1-A8`): **mic → whisper.cpp (STT local) →
`POST /api/voice` (worker) → orquestador → reply → piper (TTS) →
altavoz**. El turno es gratis; los peajes x402 están en lo que el
AGENTE pide a la app por dentro (tools → `/api/app/request`).

```
voice-loop.sh (host y Pi, el mismo script)
├── capture    arecord (o --synth para el E2E sin micrófono)
├── transcribe whisper-cli -l es (ggml-base multilingüe)
├── agent_turn POST /api/voice con Bearer de cuenta o de DISPOSITIVO
├── speak      piper es_ES-sharvard → WAV (o --output_raw | aplay)
└── loop       --once para una vuelta (tests), sin flags = conversación
```

## En el host (sin sudo, validado en esta sesión)

```sh
./host-setup.sh     # venv (PEP 668) + piper-tts + cmake pip → compila
                    # whisper.cpp + descarga ggml-base + voz es_ES
AGENTD_TOKEN=<Bearer> ./voice-loop.sh --once        # con micrófono
AGENTD_TOKEN=<Bearer> ./voice-loop.sh --once \
  --synth pregunta.wav --no-speaker --out /tmp/voz  # E2E sin mic: la
                                                    # "voz del usuario"
                                                    # es el propio piper
```

Validación E2E real (2026-10-25): piper sintetizó «Hola, ¿cuál es el
estado de la API?» → whisper transcribió (93 % de fidelidad) → turno
real por `/api/voice` con token de dispositivo → reply del orquestador
→ piper generó el WAV del altavoz (78 KB). **Bucle completo sin
hardware** — el pipeline de la Pi queda probado de punta a punta.

## En la Pi (imagen NomikOS, W2)

El post-build instala: `whisper-cli` (paquete BR2 `whisper-cpp`),
piper prebuilt aarch64 + voz es_ES y `ggml-base` (`/opt/piper`,
`/usr/share/whisper`, sha256 fijado), `voice-loop.sh` en `/usr/bin` y
`agentd-voice.service` — arranca cuando agentd tiene token (el
emparejado da el Bearer del dispositivo vía `AGENTD_STATE`).

## Variables

| Var | Default | Nota |
|---|---|---|
| `NOMIKOS_API` | `http://localhost:8080/api` | worker del ecosistema |
| `AGENTD_TOKEN` | — (o `AGENTD_STATE` en la Pi) | Bearer de cuenta o de dispositivo |
| `WHISPER_BIN/​MODEL/LANG` | `whisper.cpp/build/bin/whisper-cli`, `models/ggml-base.bin`, `es` | |
| `PIPER_BIN/​MODEL/RATE` | venv en host, `/opt/piper/piper` en Pi | 22050 Hz |
