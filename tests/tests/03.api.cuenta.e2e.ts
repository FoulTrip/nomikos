/**
 * 03.api.cuenta.e2e.ts — Config por cuenta: proveedor LLM, red/wallet,
 * keypair del orquestador (dPaaS, cifrado en reposo), sub-wallets y contexto.
 */
import { test, expect, api, json, auth, ContextSchema, generateSolanaKeypair } from './_helpers';

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
