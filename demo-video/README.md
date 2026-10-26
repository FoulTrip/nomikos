# demo-video — motor de video NomikOS (Remotion + Muse Spark)

Pipeline código→video para la demo de 3:00. Fuente de guion: `context.md` (Repomix).

## Estructura del video (5400f @30fps)

| Frames | Tiempo | Escena | Acción |
|---|---|---|---|
| 0–450 | 0:00–0:15 | hook | hero_dots: gancho problema |
| 450–1200 | 0:15–0:40 | tesis | diagram: solución NomikOS |
| 1200–2100 | 0:40–1:10 | shields | shields: Llama Guard in/out |
| 2100–3000 | 1:10–1:40 | peaje | solana_tx: handshake 402→dPaaS |
| 3000–3600 | 1:40–2:00 | confirm | diagram: settled one-shot |
| 3600–4200 | 2:00–2:20 | stack | terminal: Rust + Python |
| 4200–4800 | 2:20–2:40 | limites | diagram: gasto diario |
| 4800–5400 | 2:40–3:00 | cierre | outro_cta |

## Comandos

```bash
npm install
./scripts/build-all.sh                      # todo: contexto→guion→tts→mp4s
./scripts/build-all.sh --skip-script --skip-tts  # solo renders con data.json actual
MODEL_API_KEY=... MODEL_API_MODEL=muse-spark-1.3-contributor python3 scripts/generate-script.py
python3 scripts/generate-tts.py --only peaje --engine edge
npx remotion preview                        # vista interactiva
npx remotion render HeroCheck out/hero.mp4  # check rápido 450f
npm run render:ambient                      # fondo YouTube 16:9, loop 20s sin audio
```

Env: `MODEL_API_KEY` (dev.meta.ai), `MODEL_API_MODEL` (default `muse-spark-1.3`),
`PIPER_MODEL` (voz offline .onnx). TTS: piper preferido, edge-tts fallback.
