#!/usr/bin/env bash
# Comprueba el shield configurado en el .env raíz y el health del brain.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_ENV="$(cd -- "$SCRIPT_DIR/../.." && pwd)/.env"

python3 - "$ROOT_ENV" <<'PY'
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

env_values = {}
env_path = Path(sys.argv[1])
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        value = value.strip().strip("\"'")
        env_values[name.strip()] = value

def setting(name):
    value = os.environ.get(name, "").strip() or env_values.get(name, "")
    return re.sub(
        r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}",
        lambda match: os.environ.get(match.group(1), env_values.get(match.group(1), "")),
        value,
    ).strip()

provider = setting("GUARD_PROVIDER")
url = setting("GUARD_API_URL")
key = setting("GUARD_API_KEY")
model = setting("GUARD_MODEL")
if not all((provider, url, key, model)):
    print("Llama Guard: faltan GUARD_PROVIDER, GUARD_API_URL, GUARD_API_KEY o GUARD_MODEL")
    sys.exit(1)

payload = {
    "model": model,
    "messages": [{"role": "user", "content": "Classify this harmless greeting. Reply with safe or unsafe only. User: hola"}],
    "temperature": 0,
    "max_tokens": 16,
    "stream": False,
}
request = urllib.request.Request(
    url,
    data=json.dumps(payload).encode(),
    headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.load(response)
except urllib.error.HTTPError as error:
    print(f"Llama Guard: el proveedor respondió HTTP {error.code}")
    sys.exit(1)
except Exception as error:
    print(f"Llama Guard: proveedor no disponible ({type(error).__name__})")
    sys.exit(1)

try:
    verdict = data["choices"][0]["message"]["content"]
except (KeyError, IndexError, TypeError):
    print("Llama Guard: respuesta incompatible con Chat Completions")
    sys.exit(1)
if not isinstance(verdict, str) or not re.match(r"\s*safe\b", verdict, re.IGNORECASE):
    print("Llama Guard: el smoke call no devolvió el veredicto safe esperado")
    sys.exit(1)
print(f"Llama Guard listo · proveedor {provider} · modelo {model}")

try:
    with urllib.request.urlopen("http://127.0.0.1:8322/v1/health", timeout=3) as response:
        health = json.load(response)
    guard = health.get("guard", {})
    ready = guard.get("configured") and guard.get("provider") == provider and guard.get("model") == model
    print("Brain:", "ready" if ready else "guard config mismatch")
except Exception:
    print("Brain no responde en localhost:8322 (el proveedor sí pasó)")
PY
