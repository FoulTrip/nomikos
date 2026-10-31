#!/usr/bin/env bash
# Cross-platform local Docker entry point for Linux hosts.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ACTION="${1:-up}"
if (($#)); then shift; fi
STORAGE_BACKEND_OVERRIDE=
SERVICES=()
while (($#)); do
  case "$1" in
    --r2) STORAGE_BACKEND_OVERRIDE=r2; shift ;;
    --local) STORAGE_BACKEND_OVERRIDE=local; shift ;;
    --backend)
      (($# >= 2)) || { echo "--backend requires local or r2" >&2; exit 2; }
      STORAGE_BACKEND_OVERRIDE="$2"
      shift 2
      ;;
    --backend=*) STORAGE_BACKEND_OVERRIDE="${1#*=}"; shift ;;
    *) SERVICES+=("$1"); shift ;;
  esac
done
BUILD_ORDER=(payload-cms api brain dapp)
COMPOSE_PROFILE_ARGS=()
STORAGE_BACKEND=local

ensure_env() {
  if [[ ! -f .env ]]; then
    cp .env.example .env
    echo "created .env from .env.example"
  fi
}

set_if_empty() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then
    if grep -qE "^${key}=[[:space:]]*$" .env; then
      sed -i "s|^${key}=.*|${key}=${value}|" .env
      echo "generated $key"
    fi
  else
    printf '%s=%s\n' "$key" "$value" >> .env
    echo "generated $key"
  fi
}

initialize_env() {
  ensure_env
  set_if_empty ACCOUNTS_MASTER_KEY "$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
  set_if_empty AUTH_SECRET "$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
  set_if_empty PAYLOAD_SECRET "$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  chmod 600 .env
}

select_storage_profile() {
  if [[ -n "$STORAGE_BACKEND_OVERRIDE" ]]; then
    STORAGE_BACKEND="$STORAGE_BACKEND_OVERRIDE"
  else
    STORAGE_BACKEND="${OBJECT_STORE_BACKEND:-$(sed -n 's/^OBJECT_STORE_BACKEND=//p' .env 2>/dev/null | tail -n 1 | tr -d '\r"' | cut -d '#' -f 1 | xargs)}"
  fi
  STORAGE_BACKEND="${STORAGE_BACKEND:-local}"
  case "$STORAGE_BACKEND" in
    local|r2) ;;
    *) echo "Unsupported storage backend: $STORAGE_BACKEND (use local or r2)." >&2; exit 2 ;;
  esac
  export OBJECT_STORE_BACKEND="$STORAGE_BACKEND"
  if [[ "$STORAGE_BACKEND" == "r2" ]]; then
    # Override any stale COMPOSE_PROFILES=local in an existing .env.
    export COMPOSE_PROFILES=
  else
    export COMPOSE_PROFILES=local
    COMPOSE_PROFILE_ARGS=(--profile local)
  fi
}

require_docker() {
  command -v docker >/dev/null 2>&1 || {
    echo "Docker is not installed. Install Docker Engine with the Compose plugin." >&2
    exit 1
  }
  docker compose version >/dev/null 2>&1 || {
    echo "Docker Compose v2 is required (docker compose)." >&2
    exit 1
  }
  docker info >/dev/null 2>&1 || {
    echo "Docker is installed but its engine is not running." >&2
    exit 1
  }
}

wait_for_local_storage() {
  [[ "$STORAGE_BACKEND" == "r2" ]] && return 0
  local attempt state
  for attempt in {1..60}; do
    state="$(docker inspect --format '{{.State.Health.Status}}' nomikos-rustfs 2>/dev/null || true)"
    [[ "$state" == "healthy" ]] && return 0
    sleep 2
  done
  echo "Timed out waiting for RustFS to become healthy." >&2
  return 1
}

publish_local_model() {
  [[ "$STORAGE_BACKEND" == "r2" ]] && return 0
  local attempt status
  for attempt in {1..60}; do
    if docker compose exec -T api curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  if ! docker compose exec -T api curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    echo "Timed out waiting for the API before publishing the local model." >&2
    return 1
  fi
  status="$(docker compose exec -T api curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/device/model/head)"
  if [[ "$status" == "200" ]]; then
    echo "local simulator model is already available from RustFS"
    return 0
  fi
  docker compose exec -T api curl -fsS -X POST http://127.0.0.1:8080/api/device/model/upload >/dev/null
  echo "published the simulator model to local RustFS through the API"
}

stop_local_storage_for_r2() {
  [[ "$STORAGE_BACKEND" != "r2" ]] && return 0
  docker stop nomikos-rustfs >/dev/null 2>&1 || true
}

build_stack() {
  local service
  for service in "${BUILD_ORDER[@]}"; do
    echo "building $service"
    docker compose build "$service"
  done
}

case "$ACTION" in
  init|secrets)
    initialize_env
    ;;
  build)
    initialize_env
    select_storage_profile
    require_docker
    docker compose config --quiet
    build_stack
    ;;
  up)
    initialize_env
    select_storage_profile
    require_docker
    docker compose config --quiet
    build_stack
    stop_local_storage_for_r2
    docker compose "${COMPOSE_PROFILE_ARGS[@]}" up -d "${SERVICES[@]}"
    wait_for_local_storage
    publish_local_model
    docker compose "${COMPOSE_PROFILE_ARGS[@]}" ps
    ;;
  down)
    select_storage_profile
    require_docker
    docker compose down
    ;;
  restart)
    select_storage_profile
    require_docker
    docker compose "${COMPOSE_PROFILE_ARGS[@]}" restart "${SERVICES[@]}"
    ;;
  status)
    select_storage_profile
    require_docker
    docker compose "${COMPOSE_PROFILE_ARGS[@]}" ps --all
    ;;
  logs)
    select_storage_profile
    require_docker
    docker compose "${COMPOSE_PROFILE_ARGS[@]}" logs --tail 100 --follow "${SERVICES[@]}"
    ;;
  *)
    echo "Usage: bash scripts/nomikos.sh {init|up|build|down|restart|status|logs} [--r2|--local|--backend local|r2] [service...]" >&2
    exit 2
    ;;
esac
