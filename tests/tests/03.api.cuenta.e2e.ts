/**
 * 03.api.cuenta.e2e.ts — Config por cuenta: proveedor LLM, red/wallet,
 * keypair del orquestador (dPaaS, cifrado en reposo), sub-wallets y contexto.
 */
import { test, expect, api, json, auth, ContextSchema, generateSolanaKeypair, nvidiaKeyFromApiEnv } from './_helpers';

const withToken = (token: string) => ({ 'Authorization': `Bearer ${token}` });

test('PUT /me/llm configura el proveedor de la cuenta (sin api_key → conserva)', async ({ account }) => {
  const res = await api('/accounts/me/llm', {
    method: 'PUT',
    headers: { ...withToken(account.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'llama-stack',
      base_url: 'http://localhost:8321/v1',
      models: ['meta/muse-glimmer-30b'],
      default_model: 'meta/muse-glimmer-30b',
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; provider: string; api_key_updated: boolean };
  expect(body.ok).toBe(true);
  expect(body.provider).toBe('llama-stack');
  expect(body.api_key_updated).toBe(false);
});

test('PUT /me/llm con api_key la sella (AEAD) y NO vuelve en /me/context... excepto contrato', async ({ account }) => {
  const res = await api('/accounts/me/llm', {
    method: 'PUT',
    headers: { ...withToken(account.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'nvidia-nim',
      api_key: 'nvapi-TEST-KEY-no-valida-solo-estructura',
      models: ['meta/muse-glimmer-30b', 'meta/llama-4-scout'],
      default_model: 'meta/muse-glimmer-30b',
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { api_key_updated: boolean };
  expect(body.api_key_updated).toBe(true); // sellada con ACCOUNTS_MASTER_KEY

  // el contexto la devuelve (trade-off documentado) — el contrato la exige
  const ctx = ContextSchema.parse(await (await api('/accounts/me/context', auth(account.token))).json());
  expect(ctx.llm?.provider).toBe('nvidia-nim');
  expect(ctx.llm?.api_key).toBe('nvapi-TEST-KEY-no-valida-solo-estructura');
  expect(ctx.llm?.models).toHaveLength(2);
});

test('LLM multi-proveedor: N keys guardadas, UN solo activo + cambio de modelo', async ({ account }) => {
  const H = { ...withToken(account.token), 'Content-Type': 'application/json' };
  const put = (body: unknown) => api('/accounts/me/llm', { method: 'PUT', headers: H, body: JSON.stringify(body) });

  // dos providers con key: el primero queda activo solo
  expect((await put({ provider: 'nvidia-nim', api_key: 'nvapi-A', models: ['m-nv'], default_model: 'm-nv' })).status).toBe(200);
  expect((await put({ provider: 'openai', api_key: 'sk-B', models: ['gpt-x', 'gpt-y'], default_model: 'gpt-x' })).status).toBe(200);
  let ctx = (await (await api('/accounts/me/context', auth(account.token))).json()) as {
    llm: { provider: string } | null;
    llm_providers: { provider: string; has_key: boolean; is_active: boolean }[];
    active_provider?: string | null;
  };
  expect(ctx.llm?.provider).toBe('nvidia-nim'); // el primero auto-activo
  expect(ctx.llm_providers).toHaveLength(2);
  expect(ctx.llm_providers.every((p) => p.has_key)).toBe(true);

  // cambiar el activo + su modelo
  const act = await api('/accounts/me/llm/active', { method: 'POST', headers: H, body: JSON.stringify({ provider: 'openai' }) });
  expect(act.status).toBe(200);
  const mod = await api('/accounts/me/llm/active', { method: 'POST', headers: H, body: JSON.stringify({ model: 'gpt-y' }) });
  expect(mod.status).toBe(200);
  ctx = (await (await api('/accounts/me/context', auth(account.token))).json()) as typeof ctx & {
    llm: { provider: string; default_model: string } | null;
  };
  expect(ctx.llm?.provider).toBe('openai');
  expect(ctx.llm?.default_model).toBe('gpt-y');

  // modelo que no está en la lista → 400
  const bad = await api('/accounts/me/llm/active', { method: 'POST', headers: H, body: JSON.stringify({ model: 'no-existe' }) });
  expect(bad.status).toBe(400);

  // borrar el activo → sin activo (el agente exige reconfigurar, sin fallback)
  const del = await api('/accounts/me/llm?provider=openai', { method: 'DELETE', headers: withToken(account.token) });
  expect(del.status).toBe(200);
  const ctx2 = (await (await api('/accounts/me/context', auth(account.token))).json()) as { llm: unknown | null };
  expect(ctx2.llm).toBeNull();
});

test('POST /me/llm/refresh-models re-lista desde el servidor (NIM vivo, key sellada)', async ({ account }) => {
  const H = { ...withToken(account.token), 'Content-Type': 'application/json' };
  const refresh = (body: unknown) =>
    api('/accounts/me/llm/refresh-models', { method: 'POST', headers: H, body: JSON.stringify(body) });

  // sin proveedores → 404
  expect((await refresh({})).status).toBe(404);

  // lista vieja de 1 modelo + key REAL → el servidor re-lista (NIM vivo)
  const nvKey = await nvidiaKeyFromApiEnv();
  const put = await api('/accounts/me/llm', {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      provider: 'nvidia-nim', api_key: nvKey,
      models: ['modelo-viejo-inexistente'], default_model: 'modelo-viejo-inexistente',
    }),
  });
  expect(put.status).toBe(200); // queda auto-activo (es el primero)

  const ref = await refresh({});
  expect(ref.status).toBe(200);
  const rb = (await ref.json()) as { provider: string; models: string[]; default_model: string; default_kept: boolean };
  expect(rb.provider).toBe('nvidia-nim');
  expect(rb.models.length).toBeGreaterThan(10); // lista viva completa, no 1
  expect(rb.models).not.toContain('modelo-viejo-inexistente');
  expect(rb.models.some((m) => m.includes('embed'))).toBe(false); // filtro no-chat
  expect(rb.default_kept).toBe(false); // el viejo desapareció…
  expect(rb.default_model).toBe(rb.models[0]); // …→ primero de la lista

  // segundo refresh: el default ya es válido → se preserva
  const ref2 = (await (await refresh({})).json()) as { default_model: string; default_kept: boolean };
  expect(ref2.default_kept).toBe(true);
  expect(ref2.default_model).toBe(rb.default_model);

  // el contexto (lo que lee brain) refleja la lista nueva
  const ctx = ContextSchema.parse(await (await api('/accounts/me/context', auth(account.token))).json());
  expect(ctx.llm?.models.length).toBeGreaterThan(10);

  // proveedor explícito sin key → 400 y SU lista queda intacta
  await api('/accounts/me/llm', {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      provider: 'llama-stack', base_url: 'http://localhost:8321/v1',
      models: ['meta/muse-glimmer-30b'], default_model: 'meta/muse-glimmer-30b',
    }),
  });
  expect((await refresh({ provider: 'llama-stack' })).status).toBe(400);
  const ctx2 = (await (await api('/accounts/me/context', auth(account.token))).json()) as {
    llm_providers: { provider: string; models: string[] }[];
  };
  expect(ctx2.llm_providers.find((p) => p.provider === 'llama-stack')?.models).toEqual(['meta/muse-glimmer-30b']);

  // proveedor explícito inexistente → 404 · sin Bearer → 401
  expect((await refresh({ provider: 'openai' })).status).toBe(404);
  expect((await api('/accounts/me/llm/refresh-models', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  })).status).toBe(401);
});

test('PUT /me/chain con red y límites dPaaS', async ({ account }) => {
  const res = await api('/accounts/me/chain', {
    method: 'PUT',
    headers: { ...withToken(account.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ network: 'devnet', daily_limit_lamports: 5_000_000, tx_limit_lamports: 500_000 }),
  });
  expect(res.status).toBe(200);
  const { chain } = (await res.json()) as { chain: { network: string; daily_limit_lamports: number; tx_limit_lamports: number } };
  expect(chain.network).toBe('devnet');
  expect(chain.daily_limit_lamports).toBe(5_000_000);
});

test('PUT /me/chain con red inválida → 400', async ({ account }) => {
  const res = await api('/accounts/me/chain', {
    method: 'PUT',
    headers: { ...withToken(account.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ network: 'mainnet-beta' }),
  });
  expect(res.status).toBe(400);
});

test('keypair import: cifra en reposo, deriva pubkey y arma el dPaaS', async ({ account }) => {
  const { keypair } = generateSolanaKeypair(); // keypair ed25519 VÁLIDO
  const res = await api('/accounts/me/chain/keypair/import', {
    method: 'POST',
    headers: { ...withToken(account.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ keypair_json: keypair }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; wallet_pubkey: string; encrypted_at_rest: boolean };
  expect(body.encrypted_at_rest).toBe(true);
  expect(body.wallet_pubkey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/); // base58

  // el contexto ve el payer configurado
  const ctx = ContextSchema.parse(await (await api('/accounts/me/context', auth(account.token))).json());
  expect(ctx.chain?.payer_configured).toBe(true);
  expect(ctx.chain?.wallet_pubkey).toBe(body.wallet_pubkey);
});

test('keypair inválido (≠ 64 bytes) → 400', async ({ account }) => {
  const res = await api('/accounts/me/chain/keypair/import', {
    method: 'POST',
    headers: { ...withToken(account.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ keypair_json: [1, 2, 3] }),
  });
  expect(res.status).toBe(400);
});

test('sub-wallets (Gestor de Wallet del diagrama): crear + duplicado 409 + listar', async ({ account }) => {
  const { keypair } = generateSolanaKeypair();
  const create = await api('/accounts/me/wallets', {
    method: 'POST',
    headers: { ...withToken(account.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'dapp-00', network: 'devnet', keypair_json: keypair, daily_limit_lamports: 1_000_000 }),
  });
  expect(create.status).toBe(201);

  const dup = await api('/accounts/me/wallets', {
    method: 'POST',
    headers: { ...withToken(account.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'dapp-00', keypair_json: keypair }),
  });
  expect(dup.status).toBe(409);

  const list = await api('/accounts/me/wallets', auth(account.token));
  const { wallets } = (await list.json()) as { wallets: { label: string }[] };
  expect(wallets.map((w) => w.label)).toContain('dapp-00');
});

test('/me/x402/summary expone el dPaaS de la cuenta (wallet + límites)', async ({ account }) => {
  // setup de la cuenta: límites dPaaS (la fixture crea la cuenta en limpio)
  await api('/accounts/me/chain', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ network: 'devnet', daily_limit_lamports: 5_000_000, tx_limit_lamports: 500_000 }),
  });
  const res = await api('/accounts/me/x402/summary', auth(account.token));
  expect(res.status).toBe(200);
  const s = (await res.json()) as { dpaas: { daily_limit_lamports: number | null; tx_limit_lamports: number | null } };
  expect(s.dpaas.tx_limit_lamports).toBe(500_000);
  expect(s.dpaas.daily_limit_lamports).toBe(5_000_000);
});
