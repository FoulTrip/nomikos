#!/usr/bin/env bash
# test-layout.sh — tests de la GUI del OS (firmware/os-ui, Rust).
# La GUI vive en Rust (no_std + WASM): hit-testing táctil por pantalla,
# scroll clampado, zonas del shade/banco y humo de render (todas las
# pantallas, ambos temas, píxeles cuerdos). El panel la EJECUTA vía WASM.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/firmware"
cargo test -p os-ui 2>&1 | tail -5
