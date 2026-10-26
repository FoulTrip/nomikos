#!/bin/sh
# wait-agent-token.sh — bloquea agentd-voice hasta que el dispositivo
# esté emparejado: agentd persiste el token en AGENTD_STATE (JSON) tras
# el ciclo enroll → claim → token. Sin token no hay turnos de voz.
set -eu
STATE="${AGENTD_STATE:-/var/lib/agentd/device.json}"
echo "voz: esperando emparejado (token en $STATE)…"
while true; do
  # token presente cuando el JSON tiene "token":"<no vacío>"
  if grep -q '"token":"[^"]' "$STATE" 2>/dev/null; then
    echo "voz: dispositivo emparejado — bucle de voz ON"
    exit 0
  fi
  sleep 10
done
