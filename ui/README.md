# ui/ — Consola del verificador legal S2 (`:8765`)

Consola humana realtime del workshop (turnos, memorándum, checklist,
evidencia world/, escalado y firma attorney). Estática, sin build:

```bash
make ui   # cd ui && python3 -m http.server 8765
# abrir: http://127.0.0.1:8765/?run=run-…
```

Pide API (default `http://127.0.0.1:8080/api`), run y Bearer.
El Bearer vive solo en memoria (nunca localStorage/logs).
Datos: `GET /legal/runs/{id}` + `GET /legal/runs/{id}/checklist` con poll
2 s (+ snapshot SSE `GET /legal/runs/{id}/stream`). Acciones: inyectar
evidencia, escalar, firmar. El agente (LLM) no lee esta UI ni el
checklist (sin tool para ello).
