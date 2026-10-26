#!/usr/bin/env bash
# Convierte el OBJ generado por FreeCAD a glTF binario (.glb) comprimido.
#
# Uso:  bash tools/convert_to_gltf.sh [entrada.obj] [salida.glb]
set -euo pipefail

IN="${1:-$HOME/esp32_root.obj}"
OUT="${2:-$(dirname "$0")/../public/models/ESP32-S3-Touch-AMOLED-1.43.glb}"
TMP="$(mktemp /tmp/esp32-XXXXXX.glb)"

mkdir -p "$(dirname "$OUT")"

# OBJ (Z-up, CAD) -> glTF (Y-up, binario)
npx --yes obj2gltf@3.2.0 -i "$IN" -o "$TMP" --inputUpAxis=Z

# Optimizacion: dedup de vertices + compresion meshopt (~75% mas ligero)
npx --yes @gltf-transform/cli@latest optimize "$TMP" "$OUT" --compress meshopt

rm -f "$TMP"
ls -lh "$OUT"
