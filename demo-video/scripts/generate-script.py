#!/usr/bin/env python3
"""Genera demo-video/src/config/data.json con Muse Spark (Meta Model API).

Lee el contexto Repomix y pide un guion VideoProps JSON estricto.
Solo stdlib (urllib). Sin key solo funciona --dry-run.

  MODEL_API_KEY=... python3 scripts/generate-script.py
  python3 scripts/generate-script.py --dry-run   # mide prompt sin llamar
"""
import argparse
import json
import os
import sys
import urllib.request

BASE_URL = os.environ.get("MODEL_API_BASE", "https://api.meta.ai/v1")
MODEL = os.environ.get("MODEL_API_MODEL", "muse-spark-1.3")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ACTIONS = ["hero_dots", "terminal", "diagram", "solana_tx", "shields", "fleet_map", "voice_loop", "outro_cta"]
LANGS = ["rust", "python", "typescript", "bash"]

SYSTEM = """Eres guionista técnico de video. Devuelves SOLO JSON válido, sin fences ni texto extra.
Esquema exacto:
{"title": str, "subtitle": str, "themeId": "dots_plush",
 "scenes": [{"id": str, "durationInFrames": int>0, "narrationText": str (ES),
             "audioFile": "audio/scene-NN.mp3", "codeSnippet": str?,
             "codeLanguage": rust|python|typescript|bash?, "httpStatus": int?,
             "actionType": hero_dots|terminal|diagram|solana_tx|shields|fleet_map|voice_loop|outro_cta}]}
Reglas: suma(durationInFrames) == TOTAL_FRAMES. narrationText en español.
Estructura de jueces (3:00 @30fps, respeta bloques y presupuestos):
hook hero_dots 450f (0:00-0:15 problema) · tesis diagram 750f (0:15-0:40) ·
shields 900f (0:40-1:10 Llama Guard in/out + tools) · peaje solana_tx 900f
(1:10-1:40 handshake 402→dPaaS→X-Payment) · confirm diagram 600f (1:40-2:00
settled one-shot, replay 409) · stack terminal 600f (2:00-2:20 Rust+Python) ·
limites diagram 600f (2:20-2:40 gasto diario) · cierre outro_cta 600f (2:40-3:00).
codeSnippet debe ser literal o fiel al contexto (endpoints/tools reales, no inventados)."""


def build_prompt(context: str, total_frames: int, fps: int) -> str:
    return (
        f"TOTAL_FRAMES={total_frames} FPS={fps} (duración total {total_frames / fps:.0f}s).\n"
        "Genera el VideoProps JSON para la demo NomikOS/hackathon con este contexto:\n\n"
        f"{context}"
    )


def call_api(system: str, user: str, model: str, api_key: str) -> str:
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.4,
            "max_tokens": 6000,
        }
    ).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as res:
        payload = json.load(res)
    return payload["choices"][0]["message"]["content"]


def parse_json(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        raw = raw.rsplit("```", 1)[0]
    return json.loads(raw)


def validate(data: dict, total_frames: int) -> list[str]:
    errs = []
    for k in ("title", "subtitle", "themeId", "scenes"):
        if k not in data:
            errs.append(f"falta clave: {k}")
    scenes = data.get("scenes", [])
    if not isinstance(scenes, list) or not scenes:
        errs.append("scenes vacío o inválido")
        return errs
    total = 0
    for i, s in enumerate(scenes):
        for k in ("id", "durationInFrames", "narrationText", "actionType"):
            if k not in s:
                errs.append(f"escena {i}: falta {k}")
        if s.get("actionType") not in ACTIONS:
            errs.append(f"escena {i}: actionType inválido: {s.get('actionType')}")
        if "codeLanguage" in s and s["codeLanguage"] not in LANGS:
            errs.append(f"escena {i}: codeLanguage inválido")
        d = s.get("durationInFrames", 0)
        if not isinstance(d, int) or d <= 0:
            errs.append(f"escena {i}: durationInFrames inválido")
        else:
            total += d
    if total != total_frames:
        errs.append(f"suma frames {total} != {total_frames}")
    return errs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--context", default=os.path.join(ROOT, "context.md"))
    ap.add_argument("--output", default=os.path.join(ROOT, "src/config/data.json"))
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--total-frames", type=int, default=5400)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with open(args.context, encoding="utf-8") as f:
        context = f.read()
    prompt = build_prompt(context, args.total_frames, args.fps)
    print(f"contexto: {len(context)} chars | prompt: {len(prompt)} chars | modelo: {args.model}")
    if args.dry_run:
        print("dry-run: sin llamada a la API.")
        return 0

    api_key = os.environ.get("MODEL_API_KEY", "")
    if not api_key:
        print("ERROR: falta MODEL_API_KEY (export MODEL_API_KEY=... desde dev.meta.ai)", file=sys.stderr)
        return 2
    try:
        raw = call_api(SYSTEM, prompt, args.model, api_key)
        data = parse_json(raw)
    except Exception as e:  # noqa: BLE001 - mensaje accionable
        print(f"ERROR llamando a Meta API: {e}", file=sys.stderr)
        return 3
    errs = validate(data, args.total_frames)
    if errs:
        print("JSON inválido:", file=sys.stderr)
        for e in errs:
            print(f"  - {e}", file=sys.stderr)
        return 4
    data["hasAudio"] = False
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"OK: {args.output} ({len(data['scenes'])} escenas, {args.total_frames}f)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
