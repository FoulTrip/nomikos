#!/usr/bin/env bash
# install-app.sh <slug> <archivo-resultado.json>
#
# Instala LOCALMENTE una dapp del registro del worker (lo ejecuta el api
# en POST /api/apps/{slug}/install). Probado e IDEMPOTENTE: si ya está,
# verifica y sale rápido.
#
# Modos:
#   · HOST (normal): clona/instala/arranca la app en localhost:3100.
#   · DOCKER (NOMIKOS_APP_URL set): la app vive GESTIONADA EN EL HOST
#     (p. ej. `make up`); el api corre en contenedor y solo REGISTRA:
#     emite el resultado con esa base_url y las credenciales.
#
#   · El log (stdout/stderr) va a install_log de la tabla apps — SIN
#     secretos: las credenciales van SOLO al archivo-resultado (el api
#     las sella con ACCOUNTS_MASTER_KEY).
#   · Resultado esperado (última línea del archivo):
#       {"base_url":"http://…","email":"…","password":"…"}
#
# Requisitos (modo HOST): git · node/pnpm · curl · openssl.
set -euo pipefail

SLUG="${1:?uso: install-app.sh <slug> <result.json>}"
RESULT="${2:?uso: install-app.sh <slug> <result.json>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
step() { echo "[$(date +%H:%M:%S)] $*"; }

# credenciales: env primero (docker compose las pasa), luego el .env central
creds_from_env() {
  EMAIL="${PAYLOAD_EMAIL:-}"
  PASSWORD="${PAYLOAD_PASSWORD:-}"
}
creds_from_dotenv() {
  EMAIL="$(grep -E '^PAYLOAD_EMAIL=..' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  PASSWORD="$(grep -E '^PAYLOAD_PASSWORD=..' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"
}

# ──────────────────────────────────────────────────────────────────────
case "$SLUG" in

payload-cms)
  # MODO DOCKER: Payload corre como servicio de Compose.
  if [ -n "${NOMIKOS_APP_URL:-}" ]; then
    step "modo docker: comprobando Payload en ${NOMIKOS_APP_URL}"
    creds_from_env
    [ -n "$EMAIL" ] || creds_from_dotenv
    [ -n "$EMAIL" ] || EMAIL="agent@nomikos.$(hostname -s 2>/dev/null || echo local)"
    [ -n "$PASSWORD" ] || PASSWORD="nomikos-$(cat /proc/sys/kernel/random/uuid)"

    json_escape() {
      local value="$1"
      value="${value//\\/\\\\}"
      value="${value//\"/\\\"}"
      value="${value//$'\n'/\\n}"
      printf '%s' "$value"
    }
    EMAIL_JSON="$(json_escape "$EMAIL")"
    PASSWORD_JSON="$(json_escape "$PASSWORD")"
    AUTH_JSON="{\"email\":\"$EMAIL_JSON\",\"password\":\"$PASSWORD_JSON\"}"

    CODE=$(curl -s -o /dev/null -w '%{http_code}' \
      -X POST "$NOMIKOS_APP_URL/api/users/first-register" \
      -H 'Content-Type: application/json' -d "$AUTH_JSON")
    if [ "$CODE" != "200" ]; then
      LOGIN_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
        -X POST "$NOMIKOS_APP_URL/api/users/login" \
        -H 'Content-Type: application/json' -d "$AUTH_JSON")
      [ "$LOGIN_CODE" = "200" ] || {
        echo "ERROR: Payload rechazó first-register (HTTP $CODE) y login (HTTP $LOGIN_CODE); revisa PAYLOAD_EMAIL/PAYLOAD_PASSWORD en .env."
        exit 1
      }
    fi

    URL_JSON="$(json_escape "$NOMIKOS_APP_URL")"
    printf '{"base_url":"%s","email":"%s","password":"%s"}\n' \
      "$URL_JSON" "$EMAIL_JSON" "$PASSWORD_JSON" > "$RESULT"
    step "instalada ✓ (Payload Compose disponible; credenciales selladas por el API)"
    exit 0
  fi

  TPL="$ROOT/dapps/payload-cms/templates/with-cloudflare-d1"

  step "1/4 · código fuente (clon del upstream de Payload 3)"
  if [ ! -d "$TPL" ]; then
    git clone --depth 1 --branch v3.82.1 https://github.com/payloadcms/payload.git \
      "$ROOT/dapps/payload-cms"
  fi
  [ -d "$TPL" ] || { echo "ERROR: falta el template with-cloudflare-d1"; exit 1; }

  step "2/4 · dependencias del template"
  if [ ! -d "$TPL/node_modules" ]; then
    command -v pnpm >/dev/null || npm install -g pnpm
    (cd "$TPL" && pnpm install --ignore-workspace)
  fi

  step "3/4 · secret y servicio en :3100"
  SECRET="$(grep -E '^PAYLOAD_SECRET=..' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  [ -n "$SECRET" ] || SECRET="$(openssl rand -hex 32)"
  printf 'PAYLOAD_SECRET=%s\n' "$SECRET" > "$TPL/.env"
  if ! (echo > /dev/tcp/localhost/3100) 2>/dev/null; then
    (cd "$TPL" && nohup pnpm dev --port 3100 > /tmp/nomikos-app-payload-cms.log 2>&1 &)
  fi
  for i in $(seq 1 120); do
    (echo > /dev/tcp/localhost/3100) 2>/dev/null && break
    sleep 2
  done
  (echo > /dev/tcp/localhost/3100) 2>/dev/null \
    || { echo "ERROR: la app no levantó en :3100 (ver /tmp/nomikos-app-payload-cms.log)"; exit 1; }
  step "   · :3100 arriba"

  step "4/4 · usuario de servicio (login automático del api)"
  creds_from_dotenv
  if [ -z "$EMAIL" ]; then
    # primera vez: crear el primer usuario de la app
    EMAIL="agent@nomikos.$(hostname -s 2>/dev/null || echo local)"
    PASSWORD="$(openssl rand -hex 12)"
    CODE=$(curl -s -o /dev/null -w '%{http_code}' \
      -X POST http://localhost:3100/api/users/first-register \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
    if [ "$CODE" != "200" ]; then
      echo "ERROR: first-register HTTP $CODE — si la app ya tenía usuario,"
      echo "       pon PAYLOAD_EMAIL/PAYLOAD_PASSWORD en el .env de la raíz."
      exit 1
    fi
    step "   · primer usuario creado ($EMAIL)"
  else
    step "   · credenciales del .env central"
  fi

  printf '{"base_url":"http://localhost:3100","email":"%s","password":"%s"}\n' \
    "$EMAIL" "$PASSWORD" > "$RESULT"
  step "instalada ✓ (credenciales → resultado sellado por el api)"
  ;;

*)
  echo "ERROR: slug «$SLUG» no tiene instalador (dapps/registry/)"; exit 2 ;;
esac
