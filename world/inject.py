#!/usr/bin/env python3
"""world/inject.py — inyector de eventos externos mid-run (workshop).

El mundo exterior libera evidencia a mitad de la ejecución. El agente
la ve como turno role=world + evento new_evidence (polling por iteración
en Fase 5, visible en UI :8765). El verificador exige citarla o rehusar
explícitamente (rules.json require_refusal_on_missing_evidence).

Uso:
  BEARER=$TOK python3 inject.py --run run-... --doc exhibit-D.md --excerpt "peritaje: ..."
  X_WORLD_TOKEN=... python3 inject.py --run run-... --doc exhibit-D.md --excerpt "..." --api http://localhost:8080/api
  BEARER=$TOK python3 inject.py --run run-... --tail --since 0

Auth: Bearer de cuenta (humana o device) o header X-World-Token
(VERIFIER_WORLD_TOKEN en api). El agente NO puede auto-inyectarse:
role=world solo se escribe vía este endpoint.
Solo stdlib.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request


def _req(api: str, method: str, path: str, bearer: str = "", world_token: str = "",
         body: dict | None = None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    if world_token:
        headers["X-World-Token"] = world_token
    req = urllib.request.Request(
        api.rstrip("/") + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {"ok": False, "error": f"HTTP {e.code}"}


def main() -> int:
    ap = argparse.ArgumentParser(description="Inyecta eventos world/ en un run legal")
    ap.add_argument("--api", default=os.getenv("AGENT_OS_API_URL", "http://localhost:8080/api"))
    ap.add_argument("--run", required=True)
    ap.add_argument("--doc", default="")
    ap.add_argument("--excerpt", default="")
    ap.add_argument("--bearer", default=os.getenv("BEARER", ""))
    ap.add_argument("--world-token", default=os.getenv("X_WORLD_TOKEN", ""))
    ap.add_argument("--tail", action="store_true")
    ap.add_argument("--since", default="0")
    args = ap.parse_args()

    if args.tail:
        code, body = _req(args.api, "GET",
                           f"/legal/runs/{urllib.parse.quote(args.run)}/events?since={args.since}",
                           args.bearer, args.world_token)
        print(json.dumps(body, ensure_ascii=False, indent=2))
        return 0 if code == 200 else 1

    if not args.doc:
        print("--doc requerido (ej: exhibit-D.md)", file=sys.stderr)
        return 2
    code, body = _req(args.api, "POST", f"/legal/runs/{urllib.parse.quote(args.run)}/world",
                       args.bearer, args.world_token,
                       {"kind": "new_evidence", "doc": args.doc, "excerpt": args.excerpt})
    if code != 200:
        print(json.dumps(body, ensure_ascii=False), file=sys.stderr)
        return 1
    # Log local JSONL (auditoría del simulador de mundo).
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "events.jsonl"), "a") as f:
            f.write(json.dumps({"run": args.run, "doc": args.doc,
                                "excerpt": args.excerpt[:200]}) + "\n")
    except OSError:
        pass
    evs = body.get("events", [])
    print(json.dumps({"ok": True, "run": args.run, "events": len(evs),
                      "last": evs[-1] if evs else None}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
