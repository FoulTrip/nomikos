"""agent/run.py — runner S1 del workshop (ingenuo, sin verificar).

Uso:
  cd agent && BEARER=$TOK python3 run.py --case northbridge-v-caldera
  cd agent && BEARER=$TOK python3 run.py --case northbridge-v-caldera --memo-file memo.md
  cd agent && BEARER=$TOK python3 run.py --case northbridge-v-caldera --api http://localhost:18080/api

Flujo S1:
  1. create_run + list_case_docs + read_case_doc (Files API visible)
  2a. --memo-file: entrega ese memorándum (determinista, sin LLM)
  2b. sin --memo-file: pide el borrador a brain :8322 (gateway agéntico
      con tools list_case_docs/read_case_doc/legal_turn/submit_memorandum)
  3. submit_memorandum -> api S2 evalúa (el agente NO se auto-verifica)

Imprime JSON con {run_id, status, verdict, omissions, score}.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import files  # noqa: E402


def gateway_draft(brain_url: str, bearer: str, case_id: str, run_id: str, docs_preview: str) -> str:
    prompt = (
        f"Eres abogado junior del caso {case_id} (run {run_id}). "
        f"Investiga con list_case_docs/read_case_doc, registra tu plan con legal_turn, "
        f"y genera un memorándum en español citando nombre.md:sección. "
        f"Documentos disponibles: {docs_preview}. "
        f"IMPORTANTE: cuando tengas el borrador, llámame la tool submit_memorandum "
        f"con run_id={run_id}. No inventes exhibits."
    )
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "prompts", "legal_system.md")) as f:
            system_hint = f.read().strip()
        prompt = system_hint + "\n\n" + prompt
    except OSError:
        pass
    req = urllib.request.Request(
        brain_url.rstrip("/") + "/v1/agentic-gateway",
        method="POST",
        data=json.dumps({"device_id": "workshop-s1", "text": prompt}).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {bearer}"},
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        body = json.loads(r.read().decode() or "{}")
    if r.status != 200 or not body.get("ok", True):
        # El gateway puede devolver ok:false con tools ejecutadas (p.ej. submit
        # con fail). Devolvemos el reply para diagnóstico; el submit real lo
        # hizo la tool submit_memorandum dentro del loop.
        return body.get("reply", "")
    return body.get("reply", "")


def main() -> int:
    ap = argparse.ArgumentParser(description="S1 legal agent (workshop)")
    ap.add_argument("--case", default="northbridge-v-caldera")
    ap.add_argument("--api", default=os.getenv("AGENT_OS_API_URL", "http://localhost:8080/api"))
    ap.add_argument("--brain", default=os.getenv("BRAIN_URL", "http://localhost:8322"))
    ap.add_argument("--bearer", default=os.getenv("BEARER", ""))
    ap.add_argument("--memo-file", default="")
    args = ap.parse_args()
    if not args.bearer:
        print("falta BEARER (env BEARER=... o --bearer)", file=sys.stderr)
        return 2

    created = files.create_run(args.case, args.bearer, args.api)
    run_id = created["run"]["id"]
    print(f"run: {run_id}", file=sys.stderr)

    listed = files.list_case_docs(args.case, args.bearer, args.api)
    docs = listed.get("docs", [])
    print(f"docs: {docs}", file=sys.stderr)
    previews = []
    for name in docs:
        content = files.read_case_doc(args.case, name, args.bearer, args.api)
        previews.append(f"{name} ({len(content)} chars)")
    files.append_turn(run_id, f"S1 plan: leídos {len(docs)} docs: {', '.join(docs)}",
                      args.bearer, api_url=args.api)

    if args.memo_file:
        with open(args.memo_file) as f:
            memo = f.read()
        result = files.submit_memorandum(run_id, memo, args.bearer, args.api)
    else:
        reply = gateway_draft(args.brain, args.bearer, args.case, run_id, "; ".join(previews))
        # El loop de brain ya llamó submit_memorandum via tool; leemos el estado.
        result = files.get_run(run_id, args.bearer, args.api)
        result["gateway_reply_preview"] = reply[:500]

    run = result.get("run", {})
    verdicts = result.get("verdicts", [])
    last = verdicts[-1] if verdicts else {}
    print(json.dumps({
        "run_id": run_id,
        "status": run.get("status"),
        "verdict": last.get("verdict"),
        "omissions": last.get("omissions", []),
        "score": last.get("score"),
        "can_sign": run.get("can_sign"),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
