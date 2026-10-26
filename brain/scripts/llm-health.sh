#!/usr/bin/env bash
# llm-health.sh — salud de los backends LLM del orquestador (brain).
#
# El gateway agéntico elige backend en cascada: LLM de la CUENTA →
# llama-stack (NIM real) → ollama local. Hoy la key NIM está muerta
# (403 en todos los modelos) y el razonamiento global corre en ollama.
# Este script dice qué está vivo ANTES de flipear:
#
#   ./llm-health.sh                          # ollama + llama-stack
#   NVIDIA_API_KEY=nvdi-… ./llm-health.sh    # + prueba NIM directo
#
# Flip cuando renueves la key (documentado en context.md):
#   cd brain && NVIDIA_API_KEY=… .venv-stack/bin/llama stack run run-stack.yaml &
#   # y en brain/.env: LLM_MODEL=nvidia/meta/muse-glimmer-30b → reiniciar uvicorn
#   npm run test:e2e -- tests/06.brain.agentic.e2e.ts   # debe volver a verde
set -euo pipefail

G() { printf '  %s\n' "$*"; }

echo "── 1/3 ollama (:11434 — backend global de hoy):"
if TAGS=$(curl -s -m 5 http://localhost:11434/api/tags); then
  echo "$TAGS" | python3 -c "
import json,sys
try:
    ms = [m['name'] for m in json.load(sys.stdin)['models']]
    print('  OK · modelos:', ', '.join(ms[:5]) or '(ninguno)')
except Exception:
    print('  respuesta no entendida')
"
else
  G "DOWN — arranca: ~/.local/bin/ollama serve && ollama pull llama3.2:1b"
fi

echo "── 2/3 llama-stack (:8321 — NIM real si hay key):"
if curl -s -m 5 http://localhost:8321/v1/models -o /tmp/opencode/stack-models.json 2>/dev/null; then
  if grep -q '"data"' /tmp/opencode/stack-models.json 2>/dev/null; then
    python3 -c "
import json
d = json.load(open('/tmp/opencode/stack-models.json'))
print('  OK ·', len(d.get('data', [])), 'modelos vía stack (NIM con key viva)')
" 2>/dev/null || G "OK (respuesta no estándar)"
  else
    G "arriba pero sin modelos — la key NIM llega por env (NVIDIA_API_KEY) al lanzarlo"
  fi
else
  G "DOWN — lánzalo: cd brain && NVIDIA_API_KEY=… .venv-stack/bin/llama stack run run-stack.yaml"
fi

echo "── 3/3 NIM directo (integrate.api.nvidia.com):"
if [ -n "${NVIDIA_API_KEY:-}" ]; then
  CODE=$(curl -s -m 8 -o /tmp/opencode/nim-models.json -w "%{http_code}" \
    https://integrate.api.nvidia.com/v1/models \
    -H "Authorization: Bearer $NVIDIA_API_KEY")
  if [ "$CODE" = "200" ]; then
    python3 -c "
import json
d = json.load(open('/tmp/opencode/nim-models.json'))
print('  OK · key viva ·', len(d.get('data', [])), 'modelos — ¡el flip está listo!')
"
  else
    G "HTTP $CODE — la key sigue muerta/inválida (403 = cuenta/plan; renuévala en build.nvidia.com)"
  fi
else
  G "sin NVIDIA_API_KEY en el entorno — pásala para probarla aquí mismo"
fi

echo
echo "Diagnóstico del flujo agéntico: brain responde igual sin key (fallback"
echo "a ollama); las suites 05/12 lo ejercitan; la 06 (razonamiento fluido)"
echo "requiere la key viva."
