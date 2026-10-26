# dapps/ — las APPS del ecosistema (a las que el agente paga peaje x402)

Este directorio es el punto de integración de **apps**: cualquier
servicio HTTP con el que el **orquestador** interactúa a través del
gateway peajizado del api — cada petición del agente a la app cobra un
micro-peaje x402 que la cuenta paga por dPaaS (diagrama `diagram.d2`,
pasos 1-7).

```
brain (tool app_request) ──► POST /api/app/request {path, method, body}
   ◄── 402 + peaje «x402:app:{nombre}:{METHOD}:{path}»
   ──► la CUENTA firma (dPaaS) ──► reintento con X-Payment
   ──► el api PROXEA a {PAYLOAD_URL}{path} con auth automática
   ◄── datos de la app → el peaje se consume SOLO si la app respondió
```

## Cómo se integra una app

**Por la TIENDA** (recomendado — ver suite 15): un manifiesto en
`dapps/registry/<slug>.json` la hace aparecer en el catálogo del worker
(`GET /api/apps`), se instala con el script probado
(`nomikos apps add <slug>` o `POST /api/apps/{slug}/install`) y sus
**tools entran solas al MCP manager del agente** (catálogo del LLM +
`POST /api/agent/call`). Pasos:

1. **Manifiesto**: `dapps/registry/<slug>.json` — slug, name,
   description, `tools[]` (name, description, parameters JSON-schema y
   `call {method, path, body}` con plantillas `{arg}`) y el instalador.
2. **Instalador**: un case en `scripts/install-app.sh` (idempotente,
   probado; deja `{base_url, email?, password?, token?}` en el archivo
   resultado — el api sella las credenciales con `ACCOUNTS_MASTER_KEY`).
3. **AGREGAR** (placa/PC/docker): `nomikos apps add <slug>` — el worker
   ejecuta el script en background, la app queda `installed` con
   `base_url` + auth propias, y el peaje pasa a ser
   `x402:app:{slug}:{METHOD}:{path}` (una app por slug, N apps).

Manual (equivalente): app corriendo en un puerto local + `PAYLOAD_URL`
en el `.env` central → `make env && make up`.

El api es el dueño del peaje y del proxy: la app no sabe nada de x402.
Su política de acceso la decide ella — el api la autentica con su
credencial sellada (token fijo o login JWT cacheado por slug).

## El ejemplo incluido: Payload CMS

`dapps/payload-cms/` es un clon del monorepo upstream de Payload con
el template `with-cloudflare-d1` corriendo en `:3100` (D1 local vía
wrangler). Su puesta a punto local está versionada en
[`CONTEXT-payload-cms-local.md`](CONTEXT-payload-cms-local.md) (el clon NO se
versiona — ver `.gitignore`).

```bash
# primera vez (con la app arriba — make up):
make app-init EMAIL=agente@tudominio.dev PASSWORD=secreto   # primer usuario
# ese usuario queda en .env (PAYLOAD_EMAIL/PASSWORD) para el login automático
```

Colecciones del template: `users`, `media` — cualquier colección nueva
aparece como ruta REST `/api/<slug>` y el agente la alcanza igual vía
`app_request` (sin tocar el pipeline x402).

## Multi-app — construido

El gateway peajizado sirve **N apps**, una por slug del registro:
`POST /api/app/request {app:"payload-cms", path, method, body}` → peaje
`x402:app:{slug}:{METHOD}:{path}` → proxy a la `base_url` de ESA app con
SU credencial sellada. Sin `app`: la primera instalada (o la clásica por
`PAYLOAD_URL`). Todo congelado en la **suite 15**.
