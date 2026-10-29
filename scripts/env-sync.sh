#!/usr/bin/env bash
# Compatibility name retained for `make env`: validate the single root config.
# This script intentionally does not create service-local .env copies.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CENTRAL="$ROOT/.env"
TEMPLATE="$ROOT/.env.example"

if [ ! -f "$CENTRAL" ]; then
  echo "env: falta .env en la raíz — cp .env.example .env && make secrets" >&2
  exit 1
fi
if ! bash -n "$CENTRAL"; then
  echo "env: el .env raíz no tiene sintaxis compatible con el cargador de make up" >&2
  exit 1
fi

missing=()
declare -A missing_keys=()
for template in \
  "$TEMPLATE" \
  "$ROOT/api/.env.example" \
  "$ROOT/brain/.env.example" \
  "$ROOT/dapp/.env.example" \
  "$ROOT/dapps/payload-cms/templates/with-cloudflare-d1/.env.example"; do
  [ -f "$template" ] || continue
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^([A-Z][A-Z0-9_]*)= ]] || continue
    key="${BASH_REMATCH[1]}"
    if ! grep -qE "^${key}=" "$CENTRAL"; then
      missing_keys["$key"]=1
    fi
  done < "$template"
done
missing=("${!missing_keys[@]}")

if ((${#missing[@]})); then
  printf 'env: faltan variables en .env raíz:\n' >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "env: .env raíz validado; servicios cargan esta configuración sin copias locales."
