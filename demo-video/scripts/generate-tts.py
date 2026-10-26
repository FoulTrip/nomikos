#!/usr/bin/env python3
"""Genera public/audio/scene-*.mp3 desde data.json y reporta encaje vs frames.

Motores: piper (offline, preferido) → edge-tts (online Microsoft) → error claro.
No reescala Root (fijo 5400f): reporta overflow para ajustar guion.

  python3 scripts/generate-tts.py --only hero          # una escena
  python3 scripts/generate-tts.py                       # todas
  PIPER_MODEL=~/.local/share/piper/es.onnx python3 scripts/generate-tts.py
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS = 30
TAIL_FRAMES = 45  # respiro al final de cada escena


def load_props(path: str) -> dict:
    if not os.path.exists(path):
        path = os.path.join(ROOT, "src/config/default-data.json")
        print(f"aviso: no hay data.json, uso {path}")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def have(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def piper_model() -> str:
    cand = os.environ.get("PIPER_MODEL", "")
    if cand and os.path.exists(os.path.expanduser(cand)):
        return os.path.expanduser(cand)
    base = os.path.expanduser("~/.local/share/piper")
    if os.path.isdir(base):
        for dp, _, fns in os.walk(base):
            for fn in fns:
                if fn.endswith(".onnx"):
                    return os.path.join(dp, fn)
    return ""


def synth_piper(text: str, out_wav: str, model: str) -> None:
    subprocess.run(
        ["piper", "--model", model, "--output_file", out_wav],
        input=text.encode(), check=True, capture_output=True,
    )


def synth_edge(text: str, out_mp3: str, voice: str) -> None:
    subprocess.run(
        ["edge-tts", "--voice", voice, "--text", text, "--write-media", out_mp3],
        check=True, capture_output=True,
    )


def to_mp3(wav: str, mp3: str) -> bool:
    if not have("ffmpeg"):
        return False
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame",
         "-q:a", "4", mp3],
        check=True,
    )
    return True


def duration_sec(mp3: str) -> float | None:
    if have("ffprobe"):
        try:
            out = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "csv=p=0", mp3],
                check=True, capture_output=True, text=True,
            )
            return float(out.stdout.strip())
        except Exception:  # noqa: BLE001
            return None
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=os.path.join(ROOT, "src/config/data.json"))
    ap.add_argument("--output-props", default=os.path.join(ROOT, "src/config/data.json"))
    ap.add_argument("--out-dir", default=os.path.join(ROOT, "public/audio"))
    ap.add_argument("--only", default="", help="solo escena con este id")
    ap.add_argument("--engine", default="auto", choices=["auto", "piper", "edge"])
    ap.add_argument("--voice-edge", default="es-ES-AlvaroNeural")
    args = ap.parse_args()

    props = load_props(args.input)
    scenes = [s for s in props["scenes"] if not args.only or s["id"] == args.only]
    if not scenes:
        print(f"ERROR: escena '{args.only}' no encontrada", file=sys.stderr)
        return 2
    os.makedirs(args.out_dir, exist_ok=True)

    engine = args.engine
    model = ""
    if engine in ("auto", "piper"):
        if have("piper") and piper_model():
            engine = "piper"
            model = piper_model()
            print(f"motor: piper ({model})")
        elif args.engine == "piper":
            print("ERROR: piper sin binario o sin modelo. Exporta PIPER_MODEL=....onnx", file=sys.stderr)
            return 2
    if engine == "auto":
        if have("edge-tts"):
            engine = "edge"
            print(f"motor: edge-tts ({args.voice_edge})")
        else:
            print("ERROR: sin motores. Instala piper (offline) o: pip install edge-tts", file=sys.stderr)
            return 2
    if engine == "edge" and not have("edge-tts"):
        print("ERROR: edge-tts no instalado (pip install edge-tts)", file=sys.stderr)
        return 2

    overflow = 0
    for i, s in enumerate(props["scenes"]):
        if args.only and s["id"] != args.only:
            continue
        mp3 = os.path.join(args.out_dir, f"scene-{i + 1:02d}.mp3")
        print(f"[{s['id']}] sintetizando → {mp3} ...", flush=True)
        try:
            if engine == "piper":
                wav = mp3.replace(".mp3", ".wav")
                synth_piper(s["narrationText"], wav, model)
                if not to_mp3(wav, mp3):
                    print("  aviso: sin ffmpeg, queda WAV (ajusta audioFile)")
                    s["audioFile"] = f"audio/scene-{i + 1:02d}.wav"
                    continue
                os.remove(wav)
            else:
                synth_edge(s["narrationText"], mp3, args.voice_edge)
        except subprocess.CalledProcessError as e:
            print(f"  ERROR: {e.stderr.decode()[-500:]}", file=sys.stderr)
            return 3
        s["audioFile"] = f"audio/scene-{i + 1:02d}.mp3"
        alloc = s["durationInFrames"] - TAIL_FRAMES
        dur = duration_sec(mp3)
        if dur is None:
            print(f"  sin ffprobe: no se pudo medir (reservados {alloc / FPS:.1f}s)")
            continue
        need = dur * FPS
        status = "OK" if need <= alloc else "OVERFLOW"
        if need > alloc:
            overflow += 1
        print(f"  audio {dur:.1f}s ({need:.0f}f) vs reserva {alloc}f → {status}")

    if not args.only:
        props["hasAudio"] = True
        with open(args.output_props, "w", encoding="utf-8") as f:
            json.dump(props, f, ensure_ascii=False, indent=2)
        print(f"props: {args.output_props} (hasAudio=true)")
    if overflow:
        print(f"aviso: {overflow} escena(s) exceden su reserva: alarga durationInFrames en el guion")
    return 0


if __name__ == "__main__":
    sys.exit(main())
