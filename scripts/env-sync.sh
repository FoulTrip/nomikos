#!/usr/bin/env bash
# env-sync.sh — sincroniza el .env CENTRAL (raíz) a los .env de proyecto.
#
# Para cada proyecto: su <dir>/.env.example es la BASE; las claves del
# .env central con valor NO vacío pisan la base; las claves del central
# que el example no conoce se añaden al final en un bloque marcado (los
# proyectos ignoran variables que no usan). Claves vacías en el central
# → se respetan los defaults del example.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CENTRAL="$ROOT/.env"

if [ ! -f "$CENTRAL" ]; then
  echo "env-sync: falta .env en la raíz — cp .env.example .env (y llena lo que uses)" >&2
  exit 1
fi

sync_one() {
	local dir="$1" example="$2"
	[ -f "$example" ] || return 0
	local out="$dir/.env"

	# 1) base = example con sustituciones del central (solo valores no vacíos)
	awk -F= '
		NR==FNR {
			if ($0 ~ /^[A-Z0-9_]+=/) {
				key = $1
				val = substr($0, index($0, "=") + 1)
				if (val != "") env[key] = val
			}
			next
		}
		{
			if ($0 ~ /^[A-Z0-9_]+=/) {
			key = $1
			if (key in env) { print key "=" env[key]; next }
		}
			print
		}
	' "$CENTRAL" "$example" > "$out.tmp"

	# 2) (el bloque de "claves extra" se eliminó a propósito: los
	# */.env.example de cada proyecto son EL CONTRATO — una clave nueva
	# debe vivir ahí también. Así ningún proyecto recibe secretos que
	# no le corresponden.)
	mv "$out.tmp" "$out"
	echo "  ✓ $(realpath --relative-to="$ROOT" "$out")"
}

echo "env-sync: sincronizando desde .env central:"
sync_one "$ROOT/api" "$ROOT/api/.env.example"
sync_one "$ROOT/brain" "$ROOT/brain/.env.example"
sync_one "$ROOT/dapp" "$ROOT/dapp/.env.example"
# la APP local (si está clonada): ver dapps/README.md
sync_one "$ROOT/dapps/payload-cms/templates/with-cloudflare-d1" \
	"$ROOT/dapps/payload-cms/templates/with-cloudflare-d1/.env.example"
