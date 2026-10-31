#!/usr/bin/env bash
set -euo pipefail

mkdir -p /data
if [ -z "${PAYLOAD_SECRET:-}" ]; then
  if [ -s /data/PAYLOAD_SECRET ]; then
    PAYLOAD_SECRET="$(cat /data/PAYLOAD_SECRET)"
  else
    PAYLOAD_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
    printf '%s' "$PAYLOAD_SECRET" > /data/PAYLOAD_SECRET
    chmod 600 /data/PAYLOAD_SECRET
  fi
fi

printf 'PAYLOAD_SECRET=%s\n' "$PAYLOAD_SECRET" > .env
exec pnpm dev --port 3100
