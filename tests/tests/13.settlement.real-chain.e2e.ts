/**
 * 13.settlement.real-chain.e2e.ts — NomikOS W6: el peaje x402 se liquida
 * de VERDAD on-chain (Devnet) — el settler de ledger queda fuera del flujo.
 *
 *   ① status del faucet: treasury presente y con fondos (si falla, el
 *      error te dice exactamente cómo fundearlo)
 *   ② el faucet gotea a la wallet dPaaS de la cuenta → tx REAL en Devnet
 *   ③ peaje: POST /app/request → 402 (la app es Payload CMS real :3100)
 *   ④ dPaaS: pay-invoice firma la transfer con la wallet cifrada de la
 *      CUENTA → CONFIRMA on-chain → settled (sin tocar SQLite)
 *   ⑤ X-Payment → proxy a la app real (datos vivos del CMS) → consumido
 *   ⑥ replay del MISMO peaje → 409 (one-shot probado contra la cadena)
 */
import { test, expect, api, auth, json, generateSolanaKeypair } from './_helpers';

const withH = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

interface FaucetStatus {
  ok: boolean;
  network: string;
  treasury_pubkey: string;
  treasury_balance_lamports: number;
  lamports_per_drip: number;
}

interface Invoice {
  id: string;
  resource: string;
  status: string;
  tx_signature: string | null;
  confirmation_status?: string | null;
  account_id: string;
}

test('① faucet: treasury presente y con fondos (devnet)', async ({ account }) => {
  const st = await api('/dev/faucet', auth(account.token));
  expect(st.status).toBe(200);
  const body = (await st.json()) as FaucetStatus;
  expect(body.ok).toBe(true);
  expect(body.network).toBe('devnet');
  expect(body.treasury_pubkey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  // Si esto falla: cd api && ./scripts/faucet/faucet.sh fund
  expect(
    body.treasury_balance_lamports,
    'treasury sin SOL → `api/scripts/faucet/faucet.sh fund` (o pega el pubkey en faucet.solana.com)',
  ).toBeGreaterThan(0);
});

test('②→⑥ settlement REAL: faucet → 402 → dPaaS firma → settled on-chain → one-shot', { timeout: 180_000 }, async ({ account }) => {
  // La cuenta configura su cadena + importa el keypair dPaaS (cifrado en reposo).
  const { keypair } = generateSolanaKeypair();
  await api('/accounts/me/chain', {
    method: 'PUT', headers: withH(account.token),
    body: JSON.stringify({
      network: 'devnet', daily_limit_lamports: 50_000_000, tx_limit_lamports: 1_000_000,
    }),
  });
  const imp = await api('/accounts/me/chain/keypair/import', {
    method: 'POST', headers: withH(account.token),
    body: JSON.stringify({ keypair_json: keypair }),
  });
  expect(imp.status).toBe(200);
  const { wallet_pubkey } = (await imp.json()) as { wallet_pubkey: string };

  // ② el faucet gotea a la wallet de la cuenta — transfer REAL en Devnet.
  const drip = await api('/dev/faucet', { method: 'POST', headers: withH(account.token) });
  expect(drip.status).toBe(200);
  const d = (await drip.json()) as { wallet_pubkey: string; lamports: number; tx_signature: string };
  expect(d.wallet_pubkey).toBe(wallet_pubkey);
  expect(d.lamports).toBeGreaterThan(0);
  expect(d.tx_signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/); // tx broadcast a Devnet

  // ③ el agente pide a la app → 402 + peaje (Payload CMS real).
  const first = await api('/app/request', {
    method: 'POST', headers: withH(account.token),
    body: JSON.stringify({ path: '/api/users?limit=2&depth=0' }),
  });
  expect(first.status).toBe(402);
  const b402 = (await first.json()) as { invoice: Invoice; resource: string };
  expect(b402.invoice.account_id).toBe(account.accountId);
  expect(b402.resource).toContain('x402:app:payload');

  // ④ dPaaS: la wallet cifrada de la CUENTA firma → la tx CONFIRMA → settled.
  const pay = await api('/accounts/me/x402/pay-invoice', {
    method: 'POST', headers: withH(account.token),
    body: JSON.stringify({ invoice_id: b402.invoice.id }),
  });
  expect(pay.status).toBe(200);
  let paid = (await pay.json()) as Invoice;
  expect(paid.tx_signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/); // firma dPaaS real

  // pay-invoice sondea ~14 s; si Devnet va lento, seguimos hasta settled.
  for (let i = 0; i < 12 && paid.status !== 'settled'; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const inv = await api(`/x402/invoices/${b402.invoice.id}`, auth(account.token));
    paid = (await inv.json()) as Invoice;
  }
  expect(paid.status, `status final: ${paid.status} (tx ${paid.tx_signature})`).toBe('settled');
  expect(paid.confirmation_status).toBeTruthy(); // confirmado por la CADENA

  // ⑤ X-Payment → proxy a la app REAL: el CMS responde datos vivos.
  const second = await api('/app/request', {
    method: 'POST', headers: { ...withH(account.token), 'X-Payment': b402.invoice.id },
    body: JSON.stringify({ path: '/api/users?limit=2&depth=0' }),
  });
  expect(second.status).toBe(200);
  const done = (await second.json()) as { ok: boolean; status: number; app: string; result: { docs?: { email?: string }[] } | null };
  expect(done.ok).toBe(true);
  expect(done.status).toBe(200); // Payload :3100 respondió
  const docs = done.result?.docs ?? [];
  expect(docs.length).toBeGreaterThan(0);
  expect(docs[0].email).toContain('@');

  // ⑥ replay → 409: el peaje one-shot consumido contra la CADENA.
  const replay = await api('/app/request', {
    method: 'POST', headers: { ...withH(account.token), 'X-Payment': b402.invoice.id },
    body: JSON.stringify({ path: '/api/users?limit=1' }),
  });
  expect(replay.status).toBe(409);
});
