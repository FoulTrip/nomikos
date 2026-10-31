/**
 * 01.ecosystem.health.e2e.ts — INTEGRIDAD: cada servicio del ecosistema
 * responde y cumple su contrato (modularidad: falla aislada por servicio).
 */
import { test, expect, api, brain, HealthSchema } from './_helpers';

test('api responde health con módulos del ecosistema', async () => {
  const res = await api('/health');
  expect(res.status).toBe(200);
  const health = HealthSchema.parse(await res.json());
  expect(health.ok).toBe(true);
  expect(health.modules.x402_solana).toBeTruthy();
  expect(['local-s3', 'r2']).toContain(health.modules.object_store);
  expect(health.modules.cloudflare_r2).toBe(health.modules.object_store === 'r2');
});

test('api expone las URLs RPC de Solana por red (fuente única de verdad)', async () => {
  const res = await api('/config/solana/urls');
  expect(res.status).toBe(200);
  const { ok, urls } = (await res.json()) as { ok: boolean; urls: Record<string, string> };
  expect(ok).toBe(true);
  expect(Object.keys(urls).sort()).toEqual(['devnet', 'local', 'mainnet', 'testnet']);
  for (const url of Object.values(urls)) expect(url).toMatch(/^https?:\/\//);
});

test('brain reporta API y configuración del proveedor de guard del .env', async () => {
  const res = await brain('/v1/health');
  expect(res.status).toBe(200);
  const h = (await res.json()) as { api: { ok: boolean }; guard: { enabled: boolean; backend: string; provider: string; model: string; configured: boolean } };
  expect(h.api.ok).toBe(true); // el orquestador ve a la API
  expect(h.guard.enabled).toBe(true);
  expect(h.guard.backend).toBe(h.guard.provider);
  expect(h.guard.provider.length).toBeGreaterThan(0);
  expect(h.guard.model.length).toBeGreaterThan(0);
  expect(h.guard.configured).toBe(true);
});

test('brain expone su catálogo de herramientas (11 tools del ecosistema)', async () => {
  const res = await brain('/v1/tools');
  expect(res.status).toBe(200);
  const { ok, tools } = (await res.json()) as { ok: boolean; tools: { name: string }[] };
  expect(ok).toBe(true);
  const names = tools.map((t) => t.name);
  for (const expected of [
    'get_navbar_status', 'get_device', 'get_health', 'solana_status', 'solana_urls',
    'x402_summary', 'x402_create_invoice', 'x402_invoice_status', 'x402_pay_toll',
    'x402_payouts', 'ask_muse',
  ]) {
    expect(names).toContain(expected);
  }
});

test('navbar del ecosistema: dispositivo + Solana + ERP (payload) agregados', async () => {
  const res = await api('/navbar');
  expect(res.status).toBe(200);
  const nb = (await res.json()) as { ok: boolean; device: { name: string }; solana: unknown; erp: unknown };
  expect(nb.ok).toBe(true);
  expect(nb.device.name).toBe('ESP32-S3-Touch-AMOLED-1.43');
  expect(nb.solana).toBeTruthy(); // módulo sincronizado por el sync_loop
  expect(nb.erp).toBeTruthy(); // módulo ERP (Payload CMS) presente
});
