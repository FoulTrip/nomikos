#!/usr/bin/env bash
# stack-up.sh — arranca Llama Stack (:8321) con la key NIM de brain/.env.
# Reproducible tras restarts del server (los servicios nohup mueren):
#   brain/scripts/stack-up.sh &   # o nohup … > /tmp/llama-stack.log 2>&1 &
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
exec .venv-stack/bin/llama stack run run-stack.yaml
