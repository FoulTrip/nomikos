#!/usr/bin/env bash
# NomikOS W1 — setup del HOST para el bucle de voz (sin sudo):
#   1. venv (PEP 668) con piper-tts + cmake (pip)
#   2. whisper.cpp clonado y compilado (el mismo código que irá en la Pi)
#   3. modelos: ggml-base (STT multilingüe) + voz es_ES de piper (TTS)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="$HERE/.venv-host"
MODELS="$HERE/models"
VOICES="$HERE/voices"

echo "── 1/4 venv (PEP 668 → sin sudo) + piper-tts + cmake"
[ -d "$VENV" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q piper-tts cmake

echo "── 2/4 whisper.cpp (clonar + compilar)"
if [ ! -d "$HERE/whisper.cpp" ]; then
  git clone -q --depth 1 https://github.com/ggml-org/whisper.cpp "$HERE/whisper.cpp"
fi
if [ ! -x "$HERE/whisper.cpp/build/bin/whisper-cli" ]; then
  "$VENV/bin/cmake" -S "$HERE/whisper.cpp" -B "$HERE/whisper.cpp/build" \
    -DWHISPER_BUILD_TESTS=OFF -DWHISPER_SDL2=OFF > /dev/null
  "$VENV/bin/cmake" --build "$HERE/whisper.cpp/build" -j"$(nproc)" > /dev/null
fi

echo "── 3/4 modelo STT (ggml-base, multilingüe ≈148 MB)"
mkdir -p "$MODELS"
if [ ! -f "$MODELS/ggml-base.bin" ]; then
  curl -qL -o "$MODELS/ggml-base.bin" \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
fi

echo "── 4/4 voz TTS de piper (es_ES-sharvard-medium)"
mkdir -p "$VOICES"
for f in es_ES-sharvard-medium.onnx es_ES-sharvard-medium.onnx.json; do
  if [ ! -f "$VOICES/$f" ]; then
    curl -qL -o "$VOICES/$f" \
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/$f"
  fi
done

echo "── verificación:"
"$HERE/whisper.cpp/build/bin/whisper-cli" --version 2>&1 | head -1 || true
"$VENV/bin/python" -m piper --help 2>&1 | head -1 || true
echo "OK: host-setup completo (venv + whisper-cli + modelos)"
