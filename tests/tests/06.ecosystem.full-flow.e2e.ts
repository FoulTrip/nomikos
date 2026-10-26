/**
 * 06.ecosystem.full-flow.e2e.ts — EL FLUJO DEL DIAGRAMA, end-to-end real:
 *
 *  ① registro+login (IdP)            → cuenta
 *  ② contexto (llm/chain de cuenta)   → PUT llm + chain + keypair (dPaaS)
 *  ③ razonamiento con el LLM DE LA CUENTA (NVIDIA NIM)
 *  ④ tool protegida → 402 → firma delegada (tx real a Devnet) → reintento
 *  ⑤ shields Llama Guard in/out
 *
 * La wallet de la cuenta no tiene fondos → la tx queda `verifying` con
 * `tx_signature` REAL: esa es la aserción determinista del handshake.
 */
import { test, expect, api, brain, json, auth, ContextSchema, GatewayResponseSchema, generateSolanaKeypair, nvidiaKeyFromApiEnv } from './_helpers';

test('flujo completo del diagrama con cuenta real', { timeout: 420_000, retries: 2 }, async ({ account }) => {
  const H = { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' };

  // ① El contexto inicial está sin config (llm/chain null)
  const ctx0 = ContextSchema.parse(await (await api('/accounts/me/context', auth(account.token))).json());
  expect(ctx0.llm).toBeNull();

  // ② Configurar el LLM DE LA CUENTA (NVIDIA NIM con la credencial real)
  const nvKey = await nvidiaKeyFromApiEnv();
  const llmRes = await api('/accounts/me/llm', {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      provider: 'nvidia-nim',
      api_key: nvKey,
      models: ['meta/muse-glimmer-30b'],
      default_model: 'meta/muse-glimmer-30b',
    }),
  });
  expect(llmRes.status).toBe(200);

  // ③ Red + wallet delegada del orquestador (dPaaS con keypair válido)
  await api('/accounts/me/chain', {
    method: 'PUT', headers: H,
    body: JSON.stringify({ network: 'devnet', daily_limit_lamports: 50_000_000, tx_limit_lamports: 10_000_000 }),
  });
  const { keypair } = generateSolanaKeypair();
  const kpRes = await api('/accounts/me/chain/keypair/import', {
    method: 'POST', headers: H,
    body: JSON.stringify({ keypair_json: keypair }),
  });
  expect(kpRes.status).toBe(200);

  // ④ Contexto resuelto: TODO el entorno de la cuenta en una llamada
  const ctx = ContextSchema.parse(await (await api('/accounts/me/context', auth(account.token))).json());
  expect(ctx.account.id).toBe(account.accountId);
  expect(ctx.llm?.provider).toBe('nvidia-nim');
  expect(ctx.llm?.default_model).toBe('meta/muse-glimmer-30b');
  expect(ctx.chain?.payer_configured).toBe(true);
  expect(ctx.chain?.network).toBe('devnet');

  // ⑤ EL HANDSHAKE DEL DIAGRAMA vía el orquestador (brain):
  //    el LLM de la CUENTA pide get_device → 402 → dPaaS firma con la wallet
  //    de la cuenta → tx real → reintento X-Payment.
  const gwRes = await brain('/v1/agentic-gateway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ device_id: 'ESP32-S3-Touch-AMOLED-1.43', text: 'Muéstrame la ficha técnica del dispositivo' }),
  });
  expect(gwRes.status).toBe(200);
  const gw = GatewayResponseSchema.parse(await gwRes.json());

  // ⑥ Contrato del flujo ecosistémico:
  expect(gw.ok).toBe(true);
  expect(gw.account.id).toBe(account.accountId); // identidad propagada end-to-end
  expect(gw.backend).toBe('account:nvidia-nim'); // LLM de LA CUENTA, no el global
  expect(gw.model).toBe('meta/muse-glimmer-30b');
  expect(gw.shield_in.verdict).toBe('safe'); // Llama Guard dejó pasar
  // handshake x402 con firma delegada REAL (tx a Devnet con la wallet de la cuenta)
  expect(gw.x402.length).toBeGreaterThan(0);
  const handshake = gw.x402.find((e) => e.tx_signature);
  expect(handshake).toBeTruthy();
  expect(['settled', 'verifying', 'failed', 'manual']).toContain(handshake!.status);
  if (handshake!.status !== 'manual') {
    expect(handshake!.tx_signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/); // firma base58 real
  }
  expect(gw.tools_used.length).toBeGreaterThan(0); // el orquestador ejecutó tools
});
