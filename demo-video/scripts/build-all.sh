#!/bin/bash
# Pipeline completo: contexto → guion → TTS → renders 16:9 + 9:16.
# Uso: ./scripts/build-all.sh [--skip-context] [--skip-script] [--skip-tts] [--skip-16x9] [--skip-9x16]
set -euo pipefail
cd "$(dirname "$0")/.."

SKIP_CTX=0; SKIP_SCRIPT=0; SKIP_TTS=0; SKIP_169=0; SKIP_916=0
for a in "$@"; do case "$a" in
  --skip-context) SKIP_CTX=1;; --skip-script) SKIP_SCRIPT=1;;
  --skip-tts) SKIP_TTS=1;; --skip-16x9) SKIP_169=1;; --skip-9x16) SKIP_916=1;;
  *) echo "flag desconocida: $a"; exit 2;;
esac; done

PROPS=src/config/data.json
[ "$SKIP_CTX" = 0 ] && npx repomix --config repomix.config.json | tail -n 3

if [ "$SKIP_SCRIPT" = 0 ] && [ -n "${MODEL_API_KEY:-}" ]; then
  python3 scripts/generate-script.py
elif [ ! -f "$PROPS" ]; then
  echo "aviso: sin MODEL_API_KEY ni data.json → copio default-data.json"
  cp src/config/default-data.json "$PROPS"
else
  echo "guion: reuso $PROPS"
fi

if [ "$SKIP_TTS" = 0 ]; then
  python3 scripts/generate-tts.py --input "$PROPS" --output-props "$PROPS" \
    || { echo "AVISO: TTS falló, sigo mudo"; python3 -c "
import json; p='$PROPS'; d=json.load(open(p)); d['hasAudio']=False; json.dump(d, open(p,'w'), ensure_ascii=False, indent=2)"; }
fi

mkdir -p out
[ "$SKIP_169" = 0 ] && npx remotion render HackathonDemo out/demo_16x9.mp4 --props="$PROPS"
[ "$SKIP_916" = 0 ] && npx remotion render HackathonShort out/demo_9x16.mp4 --props="$PROPS"

echo "── out/ ──"; ls -la out/*.mp4
command -v ffprobe >/dev/null && for f in out/*.mp4; do
  echo "-- $f"; ffprobe -v error -show_entries stream=codec_type,codec_name,duration -of csv "$f"
done
