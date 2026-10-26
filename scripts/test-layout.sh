#!/usr/bin/env bash
# test-layout.sh — test unitario del hit-testing táctil (lib/screen/layout.ts).
# Sin dependencias nuevas: transpira con el tsc del dapp y corre asserts en node.
# Cubre el bug real de inRect (py <= r.h en vez de py <= r.y + r.h) que dejó
# el táctil muerto devolviendo null en todas las zonas.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT=/tmp/opencode/laytest-ci
rm -rf "$OUT"
cd "$ROOT/dapp"
npx tsc lib/screen/layout.ts --outDir "$OUT" --module commonjs --target es2020 --skipLibCheck >/dev/null 2>&1 || true
node -e "
const L = require('$OUT/layout.js');
const home = { stage: 'online', locked: false, screen: 'home', apps: [{ slug: 'payload-cms', name: 'Payload CMS', status: 'installed' }],
  llm: { active_provider: 'nvidia-nim', providers: [
    { provider: 'nvidia-nim', models: ['m1'], default_model: 'm1', has_key: true, is_active: true },
    { provider: 'openai', models: ['g1'], default_model: 'g1', has_key: true, is_active: false },
  ] } };
const cases = [];
const tiles = L.homeTiles(home);
const cx = r => r.x + r.w / 2, cy = r => r.y + r.h / 2;
cases.push([home, cx(tiles[0].rect), cy(tiles[0].rect), 'apps', 'home:cajon']);
cases.push([home, cx(tiles[1].rect), cy(tiles[1].rect), 'settings', 'home:ajustes']);
cases.push([home, cx(tiles[2].rect), cy(tiles[2].rect), 'x402', 'home:peaje']);
cases.push([home, 233, 430, null, 'home:vacio']);
cases.push([home, 10, 10, null, 'home:fuera']);
const apps = { ...home, screen: 'apps' };
cases.push([apps, 233, 74, 'home', 'apps:cabecera']);
cases.push([apps, 233, 177, 'app:payload-cms', 'apps:fila']);
const det = { ...home, screen: 'appdetail' };
cases.push([det, 233, 74, 'apps', 'appdetail:cabecera']);
const set = { ...home, screen: 'settings' };
cases.push([set, 233, 74, 'home', 'settings:cabecera']);
cases.push([set, 233, 140 + 2 * 44 + 20, 'providers', 'settings:proveedor']);
cases.push([set, 233, 140 + 3 * 44 + 20, 'models', 'settings:modelo']);
cases.push([set, 233, 140 + 4 * 44 + 20, 'lock', 'settings:bloquear']);
cases.push([set, 233, 140 + 20, null, 'settings:wifi']);
const prov = { ...home, screen: 'providers' };
cases.push([prov, 233, 74, 'settings', 'providers:cabecera']);
cases.push([prov, 233, 148 + 29, 'provider:nvidia-nim', 'providers:fila']);
const mods = { ...home, screen: 'models' };
cases.push([mods, 233, 74, 'settings', 'models:cabecera']);
cases.push([mods, 233, 148 + 29, 'model:m1', 'models:fila']);
const x = { ...home, screen: 'x402' };
cases.push([x, 233, 74, 'home', 'x402:cabecera']);
cases.push([{ ...home, locked: true }, 100, 300, 'unlock', 'locked:cualquiera']);
cases.push([{ stage: 'claim', locked: false, screen: 'home', apps: [] }, 125, 205, null, 'claim:nada']);
let fails = 0;
for (const [os, px, py, want, label] of cases) {
  const got = L.hitTest(os, px, py);
  if (got !== want) { fails++; console.log('FAIL ' + label + ' → ' + JSON.stringify(got) + ' (esperaba ' + JSON.stringify(want) + ')'); }
}
if (fails) { console.log('FALLOS: ' + fails); process.exit(1); }
console.log('layout hitTest OK (' + cases.length + '/' + cases.length + ')');
"
