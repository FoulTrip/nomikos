#!/usr/bin/env bash
# NomikOS W1 — BUCLE DE VOZ (el mismo script en el host y en la Pi):
#
#   mic (arecord) → whisper.cpp (STT) → POST /api/voice (worker) →
#   brain (orquestador) → reply → piper (TTS) → altavoz (aplay)
#
# Uso:
#   AGENTD_TOKEN=<Bearer de cuenta o dispositivo> ./voice-loop.sh            # bucle
#   ./voice-loop.sh --once              # un solo turno (micrófono)
#   ./voice-loop.sh --once --synth pregunta.wav --no-speaker --out /tmp/voz  # E2E sin mic
#
# Variables: NOMIKOS_API · AGENTD_TOKEN · WHISPER_BIN · WHISPER_MODEL ·
#            PIPER_BIN (Pi: /usr/bin/piper) · PIPER_MODEL · PIPER_SAMPLE_RATE
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
API="${NOMIKOS_API:-http://localhost:8080/api}"
TOKEN="${AGENTD_TOKEN:-}"
# Fallback Pi: agentd persiste el token del dispositivo tras el emparejado
# (enroll → claim → token); el servicio de voz lo lee de ahí.
if [ -z "$TOKEN" ] && [ -f "${AGENTD_STATE:-/var/lib/agentd/device.json}" ]; then
  TOKEN=$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' "${AGENTD_STATE:-/var/lib/agentd/device.json}" | head -1)
fi
: "${TOKEN:?export AGENTD_TOKEN=<Bearer de cuenta o dispositivo> (o define AGENTD_STATE)}"
WHISPER_BIN="${WHISPER_BIN:-$HERE/whisper.cpp/build/bin/whisper-cli}"
WHISPER_MODEL="${WHISPER_MODEL:-$HERE/models/ggml-base.bin}"
WHISPER_LANG="${WHISPER_LANG:-es}"
PIPER_MODEL="${PIPER_MODEL:-$HERE/voices/es_ES-sharvard-medium.onnx}"
PIPER_RATE="${PIPER_SAMPLE_RATE:-22050}"

# piper: en el host (venv PEP 668) o binario del sistema (Pi).
if [ -n "${PIPER_BIN:-}" ]; then
  PIPER_CMD=("$PIPER_BIN")
elif [ -x "$HERE/.venv-host/bin/python" ]; then
  PIPER_CMD=("$HERE/.venv-host/bin/python" -m piper)
else
  PIPER_CMD=(piper)
fi

ONCE=0; SYNTH=""; NO_SPEAKER=0; SECS=5; OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --once) ONCE=1 ;;
    --synth) SYNTH="$2"; shift ;;
    --no-speaker) NO_SPEAKER=1 ;;
    --secs) SECS="$2"; shift ;;
    --out) OUT="$2"; shift ;;
    *) echo "opción desconocida: $1" >&2; exit 2 ;;
  esac
  shift
done
WORK="${OUT:-/tmp/opencode/voice}"
mkdir -p "$WORK"

log() { printf '🎙  %s\n' "$*"; }

# ① captura — o un WAV sintetizado (E2E sin micrófono)
capture() {
  if [ -n "$SYNTH" ]; then
    cp "$SYNTH" "$WORK/turn.wav"
  else
    log "escuchando ${SECS}s… (habla)"
    arecord -q -f S16_LE -r 16000 -c 1 -d "$SECS" "$WORK/turn.wav"
  fi
}

# ② STT — whisper.cpp local (idioma es)
transcribe() {
  rm -f "$WORK/turn.txt"
  "$WHISPER_BIN" -m "$WHISPER_MODEL" -l "$WHISPER_LANG" -np \
    -f "$WORK/turn.wav" -otxt -of "$WORK/turn" > /dev/null 2>&1 || true
  [ -f "$WORK/turn.txt" ] && tr -d '\n' < "$WORK/turn.txt" | sed 's/^ *//; s/ *$//'
}

# ③→④ turno al worker → orquestador → reply (POST /api/voice, misma identidad)
agent_turn() {
  local text="$1" body reply
  body=$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "$text")
  reply=$(curl -s --max-time 600 -X POST "$API/voice" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$body" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("reply") or d.get("error") or "")[:400])' 2>/dev/null || true)
  [ -n "$reply" ] || reply="(sin respuesta del agente)"
  printf '%s' "$reply"
}

# ⑤ TTS → ⑥ altavoz (piper local; en la Pi suena, en el host puede escribir WAV)
speak() {
  if [ "$NO_SPEAKER" = 1 ]; then
    "${PIPER_CMD[@]}" --model "$PIPER_MODEL" -i "$WORK/reply.txt" -f "$WORK/reply.wav"
    log "respuesta lista: $WORK/reply.wav"
  else
    "${PIPER_CMD[@]}" --model "$PIPER_MODEL" -i "$WORK/reply.txt" --output_raw \
      | aplay -q -f S16_LE -r "$PIPER_RATE" -c 1
  fi
}

while true; do
  capture
  TEXT="$(transcribe)"
  if [ -z "$TEXT" ]; then
    log "(silencio — nada transcrito)"
    [ "$ONCE" = 1 ] && exit 0
    continue
  fi
  log "«$TEXT»"
  REPLY="$(agent_turn "$TEXT")"
  printf '%s' "$REPLY" > "$WORK/reply.txt"
  log "agente → $REPLY"
  speak
  [ "$ONCE" = 1 ] && exit 0
done
