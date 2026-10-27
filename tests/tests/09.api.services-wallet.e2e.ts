/**
 * 09.api.services-wallet.e2e.ts — Servicios x402 del agente + wallet operativa.
 *
 * Contrato del registro en DB (cuenta → servicio → x402):
 *   GET  /api/accounts/me/services  → catálogo con flag added (Bearer)
 *   POST /api/accounts/me/services  → 201 persiste account_services:
 *        via_x402=1, resource del peaje, snapshot payer/red (dPaaS)
 *   409 duplicado · 400 desconocido · 401 sin Bearer
 *
 * Contrato de la wallet operativa del agente (modal del panel):
 *   PUT /api/accounts/me/chain { active_wallet_label } — tri-state:
 *   label → sub-wallet existente · null/"" → principal · ausente → no toca.
 *   GET /accounts/me/context resuelve active_wallet_pubkey (lo que lee brain).
 *
 * Nivel dapp: los proxies /api/account/* reenvían el Bearer de la sesión
 * Auth.js (regla #4: la identidad vive en api, el dapp la transporta).
 */
import {
  test, expect, api, json, auth, dapp, dappLogin, generateSolanaKeypair,
} from './_helpers';
import { z } from 'zod';

// ── Contratos (zod) ──
const ServiceSchema = z.object({
  service: z.string(),
  display_name: z.string(),
  resource: z.string().startsWith('x402:'),
  via_x402: z.boolean(),
  added: z.boolean(),
  status: z.string().nullable(),
  added_at: z.number().int().nullable(),
  payer_pubkey: z.string().nullable(),
  network: z.string().nullable(),
});

const ChainSchema = z.object({
  network: z.string(),
  wallet_pubkey: z.string().nullable(),
  payee: z.string().nullable(),
  daily_limit_lamports: z.number().int().nullable(),
  tx_limit_lamports: z.number().int().nullable(),
  active_wallet_label: z.string().nullable(),
  active_wallet_pubkey: z.string().nullable(),
  payer_configured: z.boolean(),
});

const withH = (t: string) => ({
  'Authorization': `Bearer ${t}`,
  'Content-Type': 'application/json',
});

test('catálogo de servicios: medusa con flujo x402, sin agregar', async ({ account }) => {
  const res = await api('/accounts/me/services', auth(account.token));
  expect(res.status).toBe(200);
  const { ok, services } = (await res.json()) as { ok: boolean; services: unknown[] };
  expect(ok).toBe(true);
  const svc = ServiceSchema.parse(services.find((s) => (s as { service: string }).service === 'medusa'));
  expect(svc.added).toBe(false);
  expect(svc.via_x402).toBe(true); // TODO el flujo de la dapp usa x402
  expect(svc.resource).toBe('x402:path:/api/erp/*');
  expect(svc.status).toBeNull();
});

test('agregar medusa persiste el registro x402 con snapshot dPaaS (201)', async ({ account }) => {
  // contexto dPaaS de la cuenta ANTES del alta (el snapshot lo documenta)
  const { keypair } = generateSolanaKeypair();
  await api('/accounts/me/chain', { method: 'PUT', headers: withH(account.token), body: JSON.stringify({ network: 'devnet' }) });
  const kp = await api('/accounts/me/chain/keypair/import', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ keypair_json: keypair }) });
  const { wallet_pubkey } = (await kp.json()) as { wallet_pubkey: string };

  const res = await api('/accounts/me/services', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ service: 'medusa' }) });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { ok: boolean; service: { via_x402: boolean; resource: string; payer_pubkey: string | null; network: string; status: string; added_at: number } };
  expect(body.ok).toBe(true);
  // el registro en DB: cuenta → servicio → x402, con el payer y la red
  expect(body.service.via_x402).toBe(true);
  expect(body.service.resource).toBe('x402:path:/api/erp/*');
  expect(body.service.payer_pubkey).toBe(wallet_pubkey); // snapshot del dPaaS
  expect(body.service.network).toBe('devnet');
  expect(body.service.status).toBe('active');
  expect(body.service.added_at).toBeGreaterThan(0);

  // GET refleja el alta
  const list = await api('/accounts/me/services', auth(account.token));
  const svc = ServiceSchema.parse(((await list.json()) as { services: { service: string }[] }).services.find((s) => s.service === 'medusa'));
  expect(svc.added).toBe(true);
  expect(svc.status).toBe('active');
  expect(svc.payer_pubkey).toBe(wallet_pubkey);
});

test('duplicado → 409 · desconocido → 400 · sin Bearer → 401', async ({ account }) => {
  const add = await api('/accounts/me/services', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ service: 'medusa' }) });
  expect(add.status).toBe(201);

  const dup = await api('/accounts/me/services', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ service: 'medusa' }) });
  expect(dup.status).toBe(409);
  expect(((await dup.json()) as { error: string }).error).toContain('ya agregado');

  const bad = await api('/accounts/me/services', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ service: 'noexiste' }) });
  expect(bad.status).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toContain('catálogo');

  const noauth = await api('/accounts/me/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'medusa' }) });
  expect(noauth.status).toBe(401);
});

test('wallet operativa: label → sub-wallet, ausente no toca, null limpia', async ({ account }) => {
  // sub-wallet de la cuenta
  const { keypair } = generateSolanaKeypair();
  const create = await api('/accounts/me/wallets', { method: 'POST', headers: withH(account.token), body: JSON.stringify({ label: 'app-qa', network: 'devnet', keypair_json: keypair }) });
  expect(create.status).toBe(201);
  const { pubkey } = (await create.json()) as { pubkey: string };

  // label → wallet operativa resuelta en chain y en context (brain)
  const set = await api('/accounts/me/chain', { method: 'PUT', headers: withH(account.token), body: JSON.stringify({ active_wallet_label: 'app-qa' }) });
  expect(set.status).toBe(200);
  let chain = ChainSchema.parse(((await set.json()) as { chain: unknown }).chain);
  expect(chain.active_wallet_label).toBe('app-qa');
  expect(chain.active_wallet_pubkey).toBe(pubkey);

  const ctx = ChainSchema.parse(((await (await api('/accounts/me/context', auth(account.token))).json()) as { chain: unknown }).chain);
  expect(ctx.active_wallet_label).toBe('app-qa');
  expect(ctx.active_wallet_pubkey).toBe(pubkey);

  // campo ausente → NO toca la selección (tri-state)
  const keep = await api('/accounts/me/chain', { method: 'PUT', headers: withH(account.token), body: JSON.stringify({ network: 'devnet' }) });
  chain = ChainSchema.parse(((await keep.json()) as { chain: unknown }).chain);
  expect(chain.active_wallet_label).toBe('app-qa');

  // null → vuelve a la wallet principal (dPaaS)
  const clear = await api('/accounts/me/chain', { method: 'PUT', headers: withH(account.token), body: JSON.stringify({ active_wallet_label: null }) });
  chain = ChainSchema.parse(((await clear.json()) as { chain: unknown }).chain);
  expect(chain.active_wallet_label).toBeNull();

  // label inexistente → 400 (no se puede seleccionar lo que no existe)
  const ghost = await api('/accounts/me/chain', { method: 'PUT', headers: withH(account.token), body: JSON.stringify({ active_wallet_label: 'fantasma' }) });
  expect(ghost.status).toBe(400);
});

test('nivel dapp: los proxies /api/account/* reenvían el Bearer de la sesión', async () => {
  const jar = await dappLogin();

  // catálogo vía dapp (Bearer de la cookie Auth.js → api)
  const list = await dapp('/api/account/services', { jar });
  expect(list.status).toBe(200);
  const svc = ServiceSchema.parse(((await list.json()) as { services: { service: string }[] }).services.find((s) => s.service === 'medusa'));
  expect(svc.added).toBe(false);

  // alta vía dapp → 201 (registro x402 en DB)
  const add = await dapp('/api/account/services', {
    method: 'POST', jar,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: 'medusa' }),
  });
  expect(add.status).toBe(201);
  expect(((await add.json()) as { ok: boolean }).ok).toBe(true);

  // chain vía dapp: red + wallet principal
  const put = await dapp('/api/account/chain', {
    method: 'PUT', jar,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ network: 'testnet', active_wallet_label: '' }),
  });
  expect(put.status).toBe(200);
  const chain = ChainSchema.parse(((await put.json()) as { chain: unknown }).chain);
  expect(chain.network).toBe('testnet');
  expect(chain.active_wallet_label).toBeNull();

  // context vía dapp refleja el alta y la red
  const ctx = await dapp('/api/account/context', { jar });
  const body = (await ctx.json()) as { chain: { network: string } };
  expect(body.chain.network).toBe('testnet');
  const svcAfter = ServiceSchema.parse(((await (await dapp('/api/account/services', { jar })).json()) as { services: { service: string }[] }).services.find((s) => s.service === 'medusa'));
  expect(svcAfter.added).toBe(true);

  // sin sesión → 401 (el Bearer nunca llega al navegador)
  const noauth = await dapp('/api/account/services', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: 'medusa' }),
  });
  expect(noauth.status).toBe(401);
});

test('wallets conectadas del navegador (Phantom/MetaMask): varias, solo una en uso', async ({ account }) => {
  const H = { Authorization: `Bearer ${account.token}`, 'Content-Type': "application/json" };
  const post = (body: unknown) =>
    api('/accounts/me/connected-wallets', { method: 'POST', headers: H, body: JSON.stringify(body) });

  // conectar Phantom (solana) → 201 y queda en uso
  const w1 = await post({ provider: 'phantom', chain: 'solana', pubkey: '9EgkxJXATAppZgRViFFBNmhSeQbXj664zKV9ErCm6cVS' });
  expect(w1.status).toBe(201);
  const c1 = (await w1.json()) as { ok: boolean; wallet: { label: string; chain: string; is_active: boolean } };
  expect(c1.ok).toBe(true);
  expect(c1.wallet.label).toBe('phantom · 1'); // label automático
  expect(c1.wallet.is_active).toBe(true);

  // conectar MetaMask (evm) → pasa a ser LA en uso (invariante: una sola)
  const w2 = await post({ provider: 'metamask', chain: 'evm', pubkey: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' });
  expect(w2.status).toBe(201);
  const list1 = await api('/accounts/me/connected-wallets', { method: 'GET', headers: { Authorization: `Bearer ${account.token}` } });
  const l1 = (await list1.json()) as { wallets: { label: string; is_active: boolean }[]; active: { label: string } };
  expect(l1.wallets).toHaveLength(2);
  const actives = l1.wallets.filter((w) => w.is_active);
  expect(actives).toHaveLength(1); // solo una en uso
  expect(l1.active.label).toBe('metamask · 1');

  // activar la primera de nuevo → cambia la en uso
  const act = await api('/accounts/me/connected-wallets/activate', { method: 'PUT', headers: H, body: JSON.stringify({ label: 'phantom · 1' }) });
  expect(act.status).toBe(200);
  expect(((await act.json()) as { active: string }).active).toBe('phantom · 1');

  // el contexto (lo que lee brain) expone ambas + la en uso
  const ctx = (await (await api('/accounts/me/context', auth(account.token))).json()) as {
    connected_wallets: unknown[];
    active_connected_wallet: { label: string } | null;
  };
  expect(ctx.connected_wallets).toHaveLength(2);
  expect(ctx.active_connected_wallet?.label).toBe('phantom · 1');

  // validaciones: chain inválida → 400 · pubkey corta → 400 · sin Bearer → 401
  expect((await post({ provider: 'x', chain: 'bitcoin', pubkey: '12345678901234567890' })).status).toBe(400);
  expect((await post({ provider: 'x', chain: 'solana', pubkey: '123' })).status).toBe(400);
  expect(
    (await api('/accounts/me/connected-wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'x', chain: 'solana', pubkey: '12345678901234567890' }),
    })).status,
  ).toBe(401);
});

test('reconectar la misma wallet NO duplica (upsert + EIP-55 insensible)', async ({ account }) => {
  const H = { Authorization: `Bearer ${account.token}`, 'Content-Type': "application/json" };
  const post = (body: unknown) =>
    api('/accounts/me/connected-wallets', { method: 'POST', headers: H, body: JSON.stringify(body) });

  const w1 = await post({ provider: 'metamask', chain: 'evm', pubkey: '0xABCDEF1234567890abcdef1234567890ABCDEF12' });
  expect(w1.status).toBe(201);
  // misma dirección con distinto checksum EIP-55 → 200 deduped, sin fila nueva
  const w2 = await post({ provider: 'metamask', chain: 'evm', pubkey: '0xabcdef1234567890abcdef1234567890abcdef12' });
  expect(w2.status).toBe(200);
  expect(((await w2.json()) as { deduped?: boolean }).deduped).toBe(true);
  const list = await api('/accounts/me/connected-wallets', { method: 'GET', headers: { Authorization: `Bearer ${account.token}` } });
  const { wallets } = (await list.json()) as { wallets: unknown[] };
  expect(wallets).toHaveLength(1);
});

test('dPaaS automática: registro genera devnet+mainnet; summary lista para fondear', async ({ account }) => {
  const H = { Authorization: `Bearer ${account.token}`, 'Content-Type': "application/json" };
  // Solana con fondos conocidos (treasury e2e no aplica; solo forma): conectamos
  await api('/accounts/me/connected-wallets', {
    method: 'POST', headers: H,
    body: JSON.stringify({ provider: 'phantom', chain: 'solana', pubkey: '9EgkxJXATAppZgRViFFBNmhSeQbXj664zKV9ErCm6cVS' }),
  });
  const list = await api('/accounts/me/connected-wallets', { method: 'GET', headers: { Authorization: `Bearer ${account.token}` } });
  const { wallets } = (await list.json()) as { wallets: { balance_lamports?: number | null }[] };
  expect(typeof wallets[0].balance_lamports === 'number' || wallets[0].balance_lamports === null).toBe(true);

  // recién registrada: la cuenta YA tiene dPaaS (devnet activa + mainnet)
  const sum = await api('/accounts/me/x402/summary', { method: 'GET', headers: { Authorization: `Bearer ${account.token}` } });
  expect(sum.status).toBe(200);
  const dpaas = ((await sum.json()) as { dpaas: {
    wallet: string; network: string; balance_lamports: number | null;
    wallets: { network: string; wallet_pubkey: string; balance_lamports: number | null }[];
  } }).dpaas;
  expect(dpaas.network).toBe('devnet');
  expect(dpaas.wallet).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  expect(typeof dpaas.balance_lamports === 'number').toBe(true);
  const nets = dpaas.wallets.map((w) => w.network).sort();
  expect(nets).toEqual(['devnet', 'mainnet']);
  expect(dpaas.wallets[0].wallet_pubkey).not.toBe(dpaas.wallets[1].wallet_pubkey);
  for (const w of dpaas.wallets) {
    expect(typeof w.balance_lamports === 'number' || w.balance_lamports === null).toBe(true);
  }

  // generate sobra (ya existe) → 409; el contexto expone la lista para fondear
  expect((await api('/accounts/me/chain/keypair/generate', { method: 'POST', headers: H })).status).toBe(409);
  const ctx = (await (await api('/accounts/me/context', auth(account.token))).json()) as {
    chain: { wallet_pubkey: string; payer_configured: boolean; wallets: { network: string }[] };
  };
  expect(ctx.chain.payer_configured).toBe(true);
  expect(ctx.chain.wallet_pubkey).toBe(dpaas.wallet);
  expect(ctx.chain.wallets.map((w) => w.network).sort()).toEqual(['devnet', 'mainnet']);

  // cambiar de red auto-crea SU wallet (nunca una red sin dPaaS)
  const sw = await api('/accounts/me/chain', {
    method: 'PUT', headers: H, body: JSON.stringify({ network: 'testnet' }),
  });
  expect(sw.status).toBe(200);
  const ctx2 = (await (await api('/accounts/me/context', auth(account.token))).json()) as {
    chain: { network: string; wallet_pubkey: string; wallets: { network: string }[] };
  };
  expect(ctx2.chain.network).toBe('testnet');
  expect(ctx2.chain.wallets.map((w) => w.network).sort()).toEqual(['devnet', 'mainnet', 'testnet']);
  expect(ctx2.chain.wallet_pubkey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
});

test('nivel dapp: el proxy /api/account/llm guarda proveedor, key y modelo de la cuenta', async () => {
  const jar = await dappLogin();
  const H = { 'Content-Type': 'application/json' };

  // alta con key → persiste en account_llm (api_key sellada AEAD)
  const put = await dapp('/api/account/llm', {
    method: 'PUT', jar, headers: H,
    body: JSON.stringify({
      provider: 'nvidia-nim',
      api_key: 'nvapi-TEST-modal-flujo',
      models: ['meta/muse-glimmer-30b'],
      default_model: 'meta/muse-glimmer-30b',
    }),
  });
  expect(put.status).toBe(200);
  const saved = (await put.json()) as { ok: boolean; provider: string; default_model: string; api_key_updated: boolean };
  expect(saved.ok).toBe(true);
  expect(saved.provider).toBe('nvidia-nim');
  expect(saved.default_model).toBe('meta/muse-glimmer-30b');
  expect(saved.api_key_updated).toBe(true);

  // sin api_key → conserva la guardada (api_key_updated false)
  const keep = await dapp('/api/account/llm', {
    method: 'PUT', jar, headers: H,
    body: JSON.stringify({ provider: 'nvidia-nim', models: ['meta/llama-3.1-8b-instruct'], default_model: 'meta/llama-3.1-8b-instruct' }),
  });
  expect(((await keep.json()) as { api_key_updated: boolean }).api_key_updated).toBe(false);

  // elegir modelo vía dapp (POST = activate; lo que usa el modal al seleccionar)
  const sw = await dapp('/api/account/llm', {
    method: 'POST', jar, headers: H,
    body: JSON.stringify({ model: 'meta/llama-3.1-8b-instruct' }),
  });
  expect(sw.status).toBe(200);
  expect(((await sw.json()) as { ok: boolean }).ok).toBe(true);
  const badModel = await dapp('/api/account/llm', {
    method: 'POST', jar, headers: H,
    body: JSON.stringify({ model: 'no-existe' }),
  });
  expect(badModel.status).toBe(400);

  // el contexto (lo que lee brain para razonar como la cuenta) lo refleja
  const ctx = await dapp('/api/account/context', { jar });
  const llm = ((await ctx.json()) as { llm: { provider: string; default_model: string; models: string[] } }).llm;
  expect(llm.provider).toBe('nvidia-nim');
  expect(llm.default_model).toBe('meta/llama-3.1-8b-instruct');

  // provider inválido → 400 (contrato PROVIDERS de la api)
  const bad = await dapp('/api/account/llm', {
    method: 'PUT', jar, headers: H,
    body: JSON.stringify({ provider: 'noexiste', models: ['x'] }),
  });
  expect(bad.status).toBe(400);

  // Desconectar (DELETE) → la cuenta queda sin agente hasta reconfigurar
  const del = await dapp('/api/account/llm', { method: 'DELETE', jar });
  expect(del.status).toBe(200);
  expect(((await del.json()) as { ok: boolean; llm: null }).ok).toBe(true);
  const ctxOff = await dapp('/api/account/context', { jar });
  expect(((await ctxOff.json()) as { llm: unknown }).llm).toBeNull();

  // sin sesión → 401
  const noauth = await dapp('/api/account/llm', {
    method: 'PUT', headers: H,
    body: JSON.stringify({ provider: 'nvidia-nim', models: ['m'], default_model: 'm' }),
  });
  expect(noauth.status).toBe(401);
});
